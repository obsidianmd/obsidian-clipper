import { strip_md } from "./strip_md";

type SelectedText = string;

interface TextFragmentParts {
	start: string;
	end?: string;
	prefix?: string;
	suffix?: string;
}

export const fragment = (str: string, param?: string): string => {
	const extractTextFragmentParts = (
		selectedText: SelectedText
	): TextFragmentParts => {
		const text = strip_md(selectedText);
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
		} else if (words.length === 3) {
			const start = words[0];
			const end = words[2];
			return { start, end };
		} else if (words.length === 2) {
			const start = words[0];
			const end = words[1];
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
		if (Array.isArray(data)) {
			return data
				.map(
					(item) =>
						`${item} [link](${
							param ? param : ""
						}${createTextFragmentUrl(item)})`
				)
				.join("\n");
		} else if (typeof data === "object" && data !== null) {
			return Object.entries(data)
				.map(
					([key, value]) =>
						`${value} [${key}](${
							param ? param : ""
						}${createTextFragmentUrl(String(value))})`
				)
				.join("\n");
		}
	} catch (error) {
		console.error("Fragment filter error:", error);
	}
	return str;
};
