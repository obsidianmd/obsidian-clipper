export interface AppflowyConfig {
	serverUrl: string;
	apiToken: string;
	workspaceId: string;
	parentViewId: string;
}

interface DeltaOp {
	insert: string;
	attributes?: Record<string, unknown>;
}

interface Block {
	type: string;
	data: Record<string, unknown>;
	children: Block[];
}

function parseInlineMarkdown(text: string): DeltaOp[] {
	const ops: DeltaOp[] = [];
	const pattern =
		/(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\))/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(text)) !== null) {
		if (match.index > lastIndex) {
			ops.push({ insert: text.slice(lastIndex, match.index) });
		}
		if (match[2] !== undefined) {
			ops.push({ insert: match[2], attributes: { bold: true } });
		} else if (match[3] !== undefined) {
			ops.push({ insert: match[3], attributes: { italic: true } });
		} else if (match[4] !== undefined) {
			ops.push({ insert: match[4], attributes: { code: true } });
		} else if (match[5] !== undefined && match[6] !== undefined) {
			ops.push({ insert: match[5], attributes: { href: match[6] } });
		}
		lastIndex = match.index + match[0].length;
	}

	if (lastIndex < text.length) {
		ops.push({ insert: text.slice(lastIndex) });
	}

	return ops.length > 0 ? ops : [{ insert: text }];
}

function markdownToBlocks(markdown: string): Block[] {
	const blocks: Block[] = [];
	const lines = markdown.split("\n");
	let i = 0;

	// Skip YAML frontmatter
	if (lines[0] === "---") {
		i = 1;
		while (i < lines.length && lines[i] !== "---") {
			i++;
		}
		i++; // skip closing ---
	}

	while (i < lines.length) {
		const line = lines[i];

		// Heading
		const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
		if (headingMatch) {
			const level = Math.min(headingMatch[1].length, 6);
			blocks.push({
				type: "heading",
				data: {
					delta: parseInlineMarkdown(headingMatch[2]),
					level,
				},
				children: [],
			});
			i++;
			continue;
		}

		// Fenced code block
		if (line.startsWith("```")) {
			const language = line.slice(3).trim();
			const codeLines: string[] = [];
			i++;
			while (i < lines.length && !lines[i].startsWith("```")) {
				codeLines.push(lines[i]);
				i++;
			}
			i++; // skip closing ```
			blocks.push({
				type: "code",
				data: {
					delta: [{ insert: codeLines.join("\n") }],
					language: language || "auto",
				},
				children: [],
			});
			continue;
		}

		// Blockquote
		const quoteMatch = line.match(/^>\s*(.*)$/);
		if (quoteMatch) {
			blocks.push({
				type: "quote",
				data: {
					delta: parseInlineMarkdown(quoteMatch[1]),
				},
				children: [],
			});
			i++;
			continue;
		}

		// Bulleted list
		const bulletMatch = line.match(/^[-*+]\s+(.+)$/);
		if (bulletMatch) {
			blocks.push({
				type: "bulleted_list",
				data: {
					delta: parseInlineMarkdown(bulletMatch[1]),
				},
				children: [],
			});
			i++;
			continue;
		}

		// Numbered list
		const numberedMatch = line.match(/^\d+\.\s+(.+)$/);
		if (numberedMatch) {
			blocks.push({
				type: "numbered_list",
				data: {
					delta: parseInlineMarkdown(numberedMatch[1]),
				},
				children: [],
			});
			i++;
			continue;
		}

		// Horizontal rule
		if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
			blocks.push({
				type: "divider",
				data: {},
				children: [],
			});
			i++;
			continue;
		}

		// Regular paragraph (including empty lines)
		blocks.push({
			type: "paragraph",
			data: {
				delta: line.trim()
					? parseInlineMarkdown(line)
					: [{ insert: "" }],
			},
			children: [],
		});
		i++;
	}

	return blocks;
}

export async function saveToAppFlowy(
	fileContent: string,
	noteName: string,
	config: AppflowyConfig,
): Promise<void> {
	const { serverUrl, apiToken, workspaceId, parentViewId } = config;

	if (!serverUrl || !apiToken || !workspaceId) {
		throw new Error(
			"AppFlowy: Missing configuration (server URL, API token, or workspace ID)",
		);
	}

	const baseUrl = serverUrl.replace(/\/$/, "");
	const headers: Record<string, string> = {
		Authorization: `Bearer ${apiToken}`,
		"Content-Type": "application/json",
	};

	// Convert markdown to blocks
	const contentBlocks = markdownToBlocks(fileContent);

	// Wrap in a root "page" block so the server can build the full DocumentData
	// in one request — avoids the race condition with append-block after creation.
	const pageData =
		contentBlocks.length > 0
			? { type: "page", data: {}, children: contentBlocks }
			: undefined;

	const reqBody = {
		parent_view_id: parentViewId || workspaceId,
		layout: 0,
		name: noteName || "Clipped Page",
		...(pageData ? { page_data: pageData } : {}),
	};

	const createPageRes = await fetch(
		`${baseUrl}/api/workspace/${workspaceId}/page-view`,
		{
			method: "POST",
			headers,
			body: JSON.stringify(reqBody),
		},
	);

	if (!createPageRes.ok) {
		const err = await createPageRes.text();
		throw new Error(
			`AppFlowy: Failed to create page (${createPageRes.status}): ${err}`,
		);
	}
}

export async function fetchAppflowyWorkspaces(
	serverUrl: string,
	apiToken: string,
): Promise<Array<{ workspace_id: string; workspace_name: string }>> {
	const baseUrl = serverUrl.replace(/\/$/, "");
	const res = await fetch(`${baseUrl}/api/workspace`, {
		headers: {
			Authorization: `Bearer ${apiToken}`,
		},
	});

	if (!res.ok) {
		throw new Error(`AppFlowy: Failed to fetch workspaces (${res.status})`);
	}

	const data = (await res.json()) as {
		data?: Array<{ workspace_id: string; workspace_name: string }>;
	};
	return data?.data || [];
}

export async function fetchAppflowySpaces(
	serverUrl: string,
	apiToken: string,
	workspaceId: string,
): Promise<Array<{ view_id: string; name: string }>> {
	const baseUrl = serverUrl.replace(/\/$/, "");
	const res = await fetch(
		`${baseUrl}/api/workspace/${workspaceId}/folder?depth=1`,
		{
			headers: { Authorization: `Bearer ${apiToken}` },
		},
	);

	if (!res.ok) {
		throw new Error(`AppFlowy: Failed to fetch spaces (${res.status})`);
	}

	const data = (await res.json()) as {
		data?: { children?: Array<{ view_id: string; name: string }> };
	};
	// Top-level children of the workspace folder are the spaces / root folders
	return data?.data?.children || [];
}
