import { strip_md } from "./strip_md";

type SelectedText = string;

interface TextFragmentParts {
	start: string;
	end?: string;
}

export const fragment_link = (str: string, param?: string): string[] => {
	if (!param || !str.trim()) {
		return [str];
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
		const words = text.split(/\s+/).filter(Boolean);

		if (words.length > 10) {
			const start = words.slice(0, 5).join(" ");
			const end = words.slice(-5).join(" ");
			return { start, end };
		} else {
			const start = words.join(" ");
			return { start };
		}
	};

	const createTextFragmentUrl = (selectedText: SelectedText): string => {
		const { start, end } = extractTextFragmentParts(selectedText);
		const encodedEnd = end ? "," + encodeURIComponent(end) : "";
		const textFragment = encodeURIComponent(start) + encodedEnd;

		return "#:~:text=" + textFragment;
	};

	try {
		const data = JSON.parse(str);
		// Default behavior for arrays(highlights/lists)
		if (Array.isArray(data)) {
			return data.map((item) => {
				if (
					typeof item === "object" &&
					item !== null &&
					"text" in item
				) {
					return {
						...item,
						text: `${
							item.text
						} [${linktext}](${currentUrl}${createTextFragmentUrl(
							item.text
						)})`,
					};
				} else {
					return `${item} [${linktext}](${currentUrl}${createTextFragmentUrl(
						String(item)
					)})`;
				}
			});
		} else if (typeof data === "object" && data !== null) {
			// Maybe useful for other filters
			return Object.entries(data).map(
				([key, value]) =>
					`${value} [${linktext}](${currentUrl}${createTextFragmentUrl(
						String(value)
					)})`
			);
		} else if (typeof data === "string") {
			// If user pass a string
			return [
				`${data} [${linktext}](${currentUrl}${createTextFragmentUrl(
					data
				)})`,
			];
		}
	} catch (error) {
		console.error("Fragment filter error:", error);
	}
	return [str];
};
