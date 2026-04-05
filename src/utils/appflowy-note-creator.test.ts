import { describe, test, expect, vi, beforeEach } from "vitest";
import {
	saveToAppFlowy,
	fetchAppflowyWorkspaces,
	fetchAppflowySpaces,
	type AppflowyConfig,
} from "./appflowy-note-creator";

const BASE_CONFIG: AppflowyConfig = {
	serverUrl: "https://beta.appflowy.cloud",
	apiToken: "test-token",
	workspaceId: "workspace-123",
	parentViewId: "parent-456",
};

function makeFetchOk(json?: unknown) {
	return vi.fn().mockResolvedValue({
		ok: true,
		text: () => Promise.resolve(""),
		json: () => Promise.resolve(json ?? {}),
	});
}

function makeFetchError(status: number, body = "Server error") {
	return vi.fn().mockResolvedValue({
		ok: false,
		status,
		text: () => Promise.resolve(body),
		json: () => Promise.resolve({}),
	});
}

async function getRequestBody(
	content: string,
	name = "Test",
	config = BASE_CONFIG
) {
	global.fetch = makeFetchOk();
	await saveToAppFlowy(content, name, config);
	const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock
		.calls[0] as [string, RequestInit];
	return JSON.parse(init.body as string);
}

async function getBlocks(markdown: string) {
	const body = await getRequestBody(markdown);
	return (body.page_data?.children ?? []) as Array<{
		type: string;
		data: Record<string, unknown>;
		children: unknown[];
	}>;
}

beforeEach(() => {
	vi.restoreAllMocks();
});

describe("saveToAppFlowy", () => {
	test("throws when serverUrl is missing", async () => {
		await expect(
			saveToAppFlowy("Hello", "Test", { ...BASE_CONFIG, serverUrl: "" })
		).rejects.toThrow("Missing configuration");
	});

	test("throws when apiToken is missing", async () => {
		await expect(
			saveToAppFlowy("Hello", "Test", { ...BASE_CONFIG, apiToken: "" })
		).rejects.toThrow("Missing configuration");
	});

	test("throws when workspaceId is missing", async () => {
		await expect(
			saveToAppFlowy("Hello", "Test", {
				...BASE_CONFIG,
				workspaceId: "",
			})
		).rejects.toThrow("Missing configuration");
	});

	test("calls the correct endpoint URL", async () => {
		global.fetch = makeFetchOk();
		await saveToAppFlowy("Hello", "Test", BASE_CONFIG);
		const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0] as [string];
		expect(url).toBe(
			"https://beta.appflowy.cloud/api/workspace/workspace-123/page-view"
		);
	});

	test("strips trailing slash from serverUrl", async () => {
		global.fetch = makeFetchOk();
		await saveToAppFlowy("Hello", "Test", {
			...BASE_CONFIG,
			serverUrl: "https://beta.appflowy.cloud/",
		});
		const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0] as [string];
		expect(url).toBe(
			"https://beta.appflowy.cloud/api/workspace/workspace-123/page-view"
		);
	});

	test("sends Bearer token in Authorization header", async () => {
		global.fetch = makeFetchOk();
		await saveToAppFlowy("Hello", "Test", BASE_CONFIG);
		const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0] as [string, RequestInit];
		expect((init.headers as Record<string, string>)["Authorization"]).toBe(
			"Bearer test-token"
		);
	});

	test("uses POST method", async () => {
		global.fetch = makeFetchOk();
		await saveToAppFlowy("Hello", "Test", BASE_CONFIG);
		const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0] as [string, RequestInit];
		expect(init.method).toBe("POST");
	});

	test("includes noteName in request body", async () => {
		const body = await getRequestBody("Hello", "My Clipped Page");
		expect(body.name).toBe("My Clipped Page");
	});

	test('defaults noteName to "Clipped Page" when empty', async () => {
		const body = await getRequestBody("Hello", "");
		expect(body.name).toBe("Clipped Page");
	});

	test("uses parentViewId when set", async () => {
		const body = await getRequestBody("Hello", "Test", BASE_CONFIG);
		expect(body.parent_view_id).toBe("parent-456");
	});

	test("falls back to workspaceId when parentViewId is empty", async () => {
		const body = await getRequestBody("Hello", "Test", {
			...BASE_CONFIG,
			parentViewId: "",
		});
		expect(body.parent_view_id).toBe("workspace-123");
	});

	test("sets layout to 0 (document)", async () => {
		const body = await getRequestBody("Hello");
		expect(body.layout).toBe(0);
	});

	test("includes page_data when content produces blocks", async () => {
		const body = await getRequestBody("# Hello");
		expect(body.page_data).toBeDefined();
		expect(body.page_data.type).toBe("page");
		expect(Array.isArray(body.page_data.children)).toBe(true);
	});

	test("throws on API error response", async () => {
		global.fetch = makeFetchError(401, "Unauthorized");
		await expect(
			saveToAppFlowy("Hello", "Test", BASE_CONFIG)
		).rejects.toThrow("Failed to create page (401)");
	});

	test("includes error status in thrown message", async () => {
		global.fetch = makeFetchError(500, "Internal Server Error");
		await expect(
			saveToAppFlowy("Hello", "Test", BASE_CONFIG)
		).rejects.toThrow("500");
	});
});

describe("markdownToBlocks", () => {
	test("h1 heading", async () => {
		const [block] = await getBlocks("# Title");
		expect(block.type).toBe("heading");
		expect(block.data.level).toBe(1);
		expect((block.data.delta as Array<{ insert: string }>)[0].insert).toBe(
			"Title"
		);
	});

	test("h2 heading", async () => {
		const [block] = await getBlocks("## Subtitle");
		expect(block.type).toBe("heading");
		expect(block.data.level).toBe(2);
	});

	test("h3 heading", async () => {
		const [block] = await getBlocks("### Section");
		expect(block.type).toBe("heading");
		expect(block.data.level).toBe(3);
	});

	test("fenced code block without language", async () => {
		const md = "```\nconst x = 1;\n```";
		const [block] = await getBlocks(md);
		expect(block.type).toBe("code");
		expect(block.data.language).toBe("auto");
		expect((block.data.delta as Array<{ insert: string }>)[0].insert).toBe(
			"const x = 1;"
		);
	});

	test("fenced code block with language", async () => {
		const md = "```typescript\nconst x: number = 1;\n```";
		const [block] = await getBlocks(md);
		expect(block.type).toBe("code");
		expect(block.data.language).toBe("typescript");
		expect((block.data.delta as Array<{ insert: string }>)[0].insert).toBe(
			"const x: number = 1;"
		);
	});

	test("fenced code block preserves multiline content", async () => {
		const md = "```\nline1\nline2\nline3\n```";
		const [block] = await getBlocks(md);
		expect((block.data.delta as Array<{ insert: string }>)[0].insert).toBe(
			"line1\nline2\nline3"
		);
	});

	test("blockquote", async () => {
		const [block] = await getBlocks("> Some quoted text");
		expect(block.type).toBe("quote");
		expect((block.data.delta as Array<{ insert: string }>)[0].insert).toBe(
			"Some quoted text"
		);
	});

	test("bullet list with dash", async () => {
		const [block] = await getBlocks("- Item one");
		expect(block.type).toBe("bulleted_list");
		expect((block.data.delta as Array<{ insert: string }>)[0].insert).toBe(
			"Item one"
		);
	});

	test("bullet list with asterisk", async () => {
		const [block] = await getBlocks("* Item two");
		expect(block.type).toBe("bulleted_list");
	});

	test("bullet list with plus", async () => {
		const [block] = await getBlocks("+ Item three");
		expect(block.type).toBe("bulleted_list");
	});

	test("numbered list", async () => {
		const [block] = await getBlocks("1. First item");
		expect(block.type).toBe("numbered_list");
		expect((block.data.delta as Array<{ insert: string }>)[0].insert).toBe(
			"First item"
		);
	});

	test("numbered list with any number", async () => {
		const [block] = await getBlocks("42. Some item");
		expect(block.type).toBe("numbered_list");
	});

	test("horizontal rule (dashes)", async () => {
		const blocks = await getBlocks("intro\n---\nafter");
		const divider = blocks.find((b) => b.type === "divider");
		expect(divider).toBeDefined();
	});

	test("horizontal rule (asterisks)", async () => {
		const [block] = await getBlocks("***");
		expect(block.type).toBe("divider");
	});

	test("image", async () => {
		const [block] = await getBlocks(
			"![alt text](https://example.com/img.png)"
		);
		expect(block.type).toBe("image");
		expect(block.data.url).toBe("https://example.com/img.png");
	});

	test("linked image extracts image src", async () => {
		const [block] = await getBlocks(
			"[![alt](https://img.com/photo.jpg)](https://link.com)"
		);
		expect(block.type).toBe("image");
		expect(block.data.url).toBe("https://img.com/photo.jpg");
	});

	test("regular paragraph", async () => {
		const [block] = await getBlocks("Hello world");
		expect(block.type).toBe("paragraph");
		expect((block.data.delta as Array<{ insert: string }>)[0].insert).toBe(
			"Hello world"
		);
	});

	test("empty line becomes empty paragraph", async () => {
		const blocks = await getBlocks("First\n\nSecond");
		expect(blocks).toHaveLength(3);
		expect(blocks[1].type).toBe("paragraph");
		expect(
			(blocks[1].data.delta as Array<{ insert: string }>)[0].insert
		).toBe("");
	});

	test("skips YAML frontmatter", async () => {
		const md = "---\ntitle: Test\nauthor: Alice\n---\n# Hello";
		const blocks = await getBlocks(md);
		expect(blocks).toHaveLength(1);
		expect(blocks[0].type).toBe("heading");
	});

	test("produces multiple blocks from multi-line markdown", async () => {
		const md = "# Title\n\nSome paragraph.\n\n- item 1\n- item 2";
		const blocks = await getBlocks(md);
		expect(blocks.length).toBeGreaterThanOrEqual(4);
	});

	test("all blocks have children array", async () => {
		const blocks = await getBlocks("# H1\nParagraph\n- list");
		for (const block of blocks) {
			expect(Array.isArray(block.children)).toBe(true);
		}
	});
});

describe("parseInlineMarkdown", () => {
	async function getDelta(text: string) {
		const blocks = await getBlocks(text);
		return blocks[0].data.delta as Array<{
			insert: string;
			attributes?: Record<string, unknown>;
		}>;
	}

	test("plain text produces single op", async () => {
		const delta = await getDelta("Hello world");
		expect(delta).toHaveLength(1);
		expect(delta[0]).toEqual({ insert: "Hello world" });
	});

	test("bold text", async () => {
		const delta = await getDelta("**bold**");
		expect(delta).toContainEqual({
			insert: "bold",
			attributes: { bold: true },
		});
	});

	test("italic text", async () => {
		const delta = await getDelta("*italic*");
		expect(delta).toContainEqual({
			insert: "italic",
			attributes: { italic: true },
		});
	});

	test("inline code", async () => {
		const delta = await getDelta("`myFunc()`");
		expect(delta).toContainEqual({
			insert: "myFunc()",
			attributes: { code: true },
		});
	});

	test("link", async () => {
		const delta = await getDelta("[click here](https://example.com)");
		expect(delta).toContainEqual({
			insert: "click here",
			attributes: { href: "https://example.com" },
		});
	});

	test("mixed inline: text + bold + text", async () => {
		const delta = await getDelta("Hello **world** again");
		expect(delta).toHaveLength(3);
		expect(delta[0]).toEqual({ insert: "Hello " });
		expect(delta[1]).toEqual({
			insert: "world",
			attributes: { bold: true },
		});
		expect(delta[2]).toEqual({ insert: " again" });
	});

	test("mixed inline: bold + code", async () => {
		const delta = await getDelta("**bold** and `code`");
		const bold = delta.find((op) => op.attributes?.bold);
		const code = delta.find((op) => op.attributes?.code);
		expect(bold?.insert).toBe("bold");
		expect(code?.insert).toBe("code");
	});
});

describe("fetchAppflowyWorkspaces", () => {
	test("returns workspace list from API", async () => {
		global.fetch = makeFetchOk({
			data: [
				{ workspace_id: "ws-1", workspace_name: "My Workspace" },
				{ workspace_id: "ws-2", workspace_name: "Team Workspace" },
			],
		});
		const result = await fetchAppflowyWorkspaces(
			"https://beta.appflowy.cloud",
			"token"
		);
		expect(result).toHaveLength(2);
		expect(result[0].workspace_id).toBe("ws-1");
		expect(result[1].workspace_name).toBe("Team Workspace");
	});

	test("calls correct API endpoint", async () => {
		global.fetch = makeFetchOk({ data: [] });
		await fetchAppflowyWorkspaces(
			"https://beta.appflowy.cloud",
			"my-token"
		);
		const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0] as [string, RequestInit];
		expect(url).toBe("https://beta.appflowy.cloud/api/workspace");
		expect((init.headers as Record<string, string>)["Authorization"]).toBe(
			"Bearer my-token"
		);
	});

	test("strips trailing slash from serverUrl", async () => {
		global.fetch = makeFetchOk({ data: [] });
		await fetchAppflowyWorkspaces("https://beta.appflowy.cloud/", "token");
		const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0] as [string];
		expect(url).toBe("https://beta.appflowy.cloud/api/workspace");
	});

	test("returns empty array when data is missing from response", async () => {
		global.fetch = makeFetchOk({});
		const result = await fetchAppflowyWorkspaces(
			"https://beta.appflowy.cloud",
			"token"
		);
		expect(result).toEqual([]);
	});

	test("throws on HTTP error", async () => {
		global.fetch = makeFetchError(401);
		await expect(
			fetchAppflowyWorkspaces("https://beta.appflowy.cloud", "bad-token")
		).rejects.toThrow("Failed to fetch workspaces (401)");
	});

	test("throws on 500 error", async () => {
		global.fetch = makeFetchError(500);
		await expect(
			fetchAppflowyWorkspaces("https://beta.appflowy.cloud", "token")
		).rejects.toThrow("500");
	});
});

describe("fetchAppflowySpaces", () => {
	test("returns spaces list from API", async () => {
		global.fetch = makeFetchOk({
			data: {
				children: [
					{ view_id: "space-1", name: "General" },
					{ view_id: "space-2", name: "Projects" },
				],
			},
		});
		const result = await fetchAppflowySpaces(
			"https://beta.appflowy.cloud",
			"token",
			"ws-1"
		);
		expect(result).toHaveLength(2);
		expect(result[0].view_id).toBe("space-1");
		expect(result[1].name).toBe("Projects");
	});

	test("calls correct API endpoint with workspaceId", async () => {
		global.fetch = makeFetchOk({ data: { children: [] } });
		await fetchAppflowySpaces(
			"https://beta.appflowy.cloud",
			"my-token",
			"workspace-xyz"
		);
		const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0] as [string, RequestInit];
		expect(url).toBe(
			"https://beta.appflowy.cloud/api/workspace/workspace-xyz/folder?depth=1"
		);
		expect((init.headers as Record<string, string>)["Authorization"]).toBe(
			"Bearer my-token"
		);
	});

	test("filters out deleted spaces", async () => {
		global.fetch = makeFetchOk({
			data: {
				children: [
					{ view_id: "space-1", name: "Active" },
					{ view_id: "space-2", name: "Deleted", is_deleted: true },
					{ view_id: "space-3", name: "Also Active" },
				],
			},
		});
		const result = await fetchAppflowySpaces(
			"https://beta.appflowy.cloud",
			"token",
			"ws-1"
		);
		expect(result).toHaveLength(2);
		expect(result.map((s) => s.view_id)).toEqual(["space-1", "space-3"]);
	});

	test("returns empty array when children is missing", async () => {
		global.fetch = makeFetchOk({ data: {} });
		const result = await fetchAppflowySpaces(
			"https://beta.appflowy.cloud",
			"token",
			"ws-1"
		);
		expect(result).toEqual([]);
	});

	test("returns empty array when data is missing", async () => {
		global.fetch = makeFetchOk({});
		const result = await fetchAppflowySpaces(
			"https://beta.appflowy.cloud",
			"token",
			"ws-1"
		);
		expect(result).toEqual([]);
	});

	test("throws on HTTP error", async () => {
		global.fetch = makeFetchError(403, "Forbidden");
		await expect(
			fetchAppflowySpaces("https://beta.appflowy.cloud", "token", "ws-1")
		).rejects.toThrow("Failed to fetch spaces (403)");
	});

	test("strips trailing slash from serverUrl", async () => {
		global.fetch = makeFetchOk({ data: { children: [] } });
		await fetchAppflowySpaces(
			"https://beta.appflowy.cloud/",
			"token",
			"ws-1"
		);
		const [url] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0] as [string];
		expect(url).not.toContain("//api");
	});
});
