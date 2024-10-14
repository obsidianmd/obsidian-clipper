import { strip_md } from "./strip_md";

type SelectedText = string;

interface TextFragmentParts {
	start: string;
	end?: string;
	prefix?: string;
	suffix?: string;
}

export const fragment = (str: string, param?: string): string => {
	if (!param || !str.trim()) {
		return str;
	}

	// Use a regex to split the param, extracting the URL and custom name
	const match = param.match(/^(.*?):?((https?:\/\/|file:\/\/).*$)/);
	const linktext = String(
		match?.[1]?.trim().replace(/(['"])/g, "") || "link"
	); // Custom name (if any), with quotes removed
	const currentUrl = String(match?.[2] || param); // URL (or whole param if no URL found)

	const extractTextFragmentParts = (
		selectedText: SelectedText
	): TextFragmentParts => {
		const text = strip_md(selectedText);
		console.log(text);
		const words = text.split(/\s+/).filter(Boolean);

		// Use prefix and suffix to create a more accurate text fragment
		// However, it will highlight center part of the text rather than start and end
		// But it should be enough for most cases, for people who want to use this filter
		// to scroll to the exact position of the text
		if (words.length >= 4) {
			const prefix = words[0];
			const suffix = words[words.length - 1];
			const start = words.slice(1, -2).join(" ");
			const end = words[words.length - 2];
			return { start, end, prefix, suffix };
		} else if (words.length < 4) {
			const start = words[0];
			const end = words[words.length - 1];
			return { start, end };
		}

		return { start: text };
	};

	const createTextFragmentUrl = (selectedText: SelectedText): string => {
		const { start, end, prefix, suffix } =
			extractTextFragmentParts(selectedText);
		const encodedEnd = end ? "," + encodeURIComponent(end) : "";
		const encodedPrefix = prefix ? encodeURIComponent(prefix) + "-," : "";
		const encodedSuffix = suffix ? ",-" + encodeURIComponent(suffix) : "";
		const textFragment =
			encodedPrefix +
			encodeURIComponent(start) +
			encodedEnd +
			encodedSuffix;

		return "#:~:text=" + textFragment;
	};

	try {
		const data = JSON.parse(str);
		// Default behavior for arrays(highlights/lists)
		if (Array.isArray(data)) {
			return data
				.map(
					(item) =>
						`${item} [${linktext}](${currentUrl}${createTextFragmentUrl(
							item
						)})`
				)
				.join("\n");
		} else if (typeof data === "object" && data !== null) {
			// Maybe useful for other filters
			return Object.entries(data)
				.map(
					([key, value]) =>
						`${value} [${linktext}](${currentUrl}${createTextFragmentUrl(
							String(value)
						)})`
				)
				.join("\n");
		} else if (typeof data === "string") {
			// If user pass a string
			return `${data} [${linktext}](${currentUrl}${createTextFragmentUrl(
				data
			)})`;
		}
	} catch (error) {
		console.error("Fragment filter error:", error);
	}
	return str;
};
