---
permalink: web-clipper/filters
---
Filters allow you to modify [[variables]] in [[Obsidian Web Clipper/Templates|Web Clipper templates]]. Filters are applied to variables using the syntax `{{variable|filter}}`.

- Filters work for any kind of [[Variables|variable]] including `prompt`, `meta`, `selector`, and `schema` variables.
- Filters can be chained, e.g. `{{variable|filter1|filter2}}`, and are applied in the order they are added.

## Dates

Filters to convert and modify dates.

- `date` converts a date to the specified format, [see reference](https://day.js.org/docs/en/display/format).
	- `{{date|date:"YYYY-MM-DD"}}` converts the current date to "YYYY-MM-DD".
	- Use `date:("outputFormat", "inputFormat")` to specify the input format, e.g. `"12/01/2024"|date:("YYYY-MM-DD", "MM/DD/YYYY")` parses "12/01/2024" and returns `"2024-12-01"`.
- `date_modify` modifies a date by adding or subtracting a specified amount of time, [see reference](https://day.js.org/docs/en/manipulate/add).
	- `"2024-12-01"|date_modify:"+1 year"` returns `"2025-12-01"`
	- `"2024-12-01"|date_modify:"- 2 months"` returns `"2024-10-01"`

## Numbers

Filters to modify numbers.

- `calc` performs basic arithmetic operations on numbers.
	- Supports operators: `+`, `-`, `*`, `/`, `**` (or `^`) for exponentiation.
	- Example: `"5"|calc:"+10"` returns `"15"`.
	- Example: `"2"|calc:"**3"` returns `"8"` (2 cubed).
	- Returns the original string if the input is not a number.
- `length` returns the length of strings, arrays, or number of keys in objects.
	- For strings: `"hello"|length` returns `"5".`
	- For arrays: `["a","b","c"]|length` returns `"3".`
	- For objects: `{"a":1,"b":2}|length` returns `"2"`.
- `round` rounds a number to the nearest integer or to a specified number of decimal places.
	- Without parameters: `3.7|round` returns `4`.
	- With decimal places specified: `3.14159|round:2` returns `3.14`.

## Text conversion and capitalization

Filters to convert text strings from one format to another.

- `camel` converts text to `camelCase`.
- `capitalize` capitalizes the first character of the value and converts the rest to lowercase, e.g. `"hELLO wORLD"|capitalize` returns `"Hello world"`.
- `kebab` converts text to `kebab-case`.
- `lower` converts text to `lowercase`.
- `pascal` converts text to `PascalCase`.
- `replace` replaces occurrences of specified text:
	- Simple replacement: `"hello!"|replace:",":""` removes all commas.
	- Multiple replacements: `"hello world"|replace:("e":"a","o":"0")` returns `"hall0 w0rld"`.
	- Replacements are applied in the order they are specified.
	- To remove specified text, use `""` as the replacement value.
	- Special characters including `: | { } ( ) ' "` should be escaped with a backslash when used in the search term, e.g. `\:` to search for a literal colon.
- `safe_name` converts text to a safe file name.
	- By default, `safe_name` applies the most conservative sanitization rules.
	- OS-specific rules can be applied with `safe_name:os` where `os` can be `windows`, `mac`, or `linux` to only apply the rules for that operating system.
- `snake` converts text to `snake_case`.
- `title` converts text to `Title Case`, e.g. `"hello world"|title` returns `"Hello World"`.
- `trim` removes white space from both ends of a string.
	- `"  hello world  "|trim` returns `"hello world"`.
- `uncamel` converts camelCase or PascalCase to space-separated words, which you can further format with other filters like `title` or `capitalize`.
	- `"camelCase"|uncamel` returns `"camel case"`.
	- `"PascalCase"|uncamel` returns `"pascal case"`.
- `upper` converts a value to uppercase, e.g. `"hello world"|upper` returns `"HELLO WORLD"`.

## Text formatting

Filters to apply [[Basic formatting syntax]] and [[Advanced formatting syntax]] to text.

- `blockquote` adds a Markdown quote prefix (`> `) to each line of the input.
- `callout` creates a [[Callouts|callout]] with optional parameters: `{{variable|callout:("type", "title", foldState)}}`
	- `type` is the callout type, and defaults to "info"
	- `title` is the callout title, and defaults to empty
	- `foldState` is a boolean to set the fold state (true for folded, false for unfolded, null for not foldable)
- `footnote` converts an array or object into a list of Markdown footnotes.
	- For arrays: `["first item","second item"]|footnote` returns: `[^1]: first item` etc.
	- For objects: `{"First Note": "Content 1", "Second Note": "Content 2"}|footnote` returns: `[^first-note]: Content 1` etc.
- `fragment_link` converts strings and arrays into [text fragment](https://developer.mozilla.org/en-US/docs/Web/URI/Fragment/Text_fragments) links. Defaults to "link" for the link text.
	- `highlights|fragment` returns `Highlight content [link](text-fragment-url)`
	- `highlights|fragment:"custom title"` returns `Highlight content [custom title](text-fragment-url)`
- `image` converts strings, arrays, or objects into Markdown image syntax.
	- For strings: `"image.jpg"|image:"alt text"` returns `![alt text](image.jpg)`.
	- For arrays: `["image1.jpg","image2.jpg"]|image:"alt text"` returns an array of Markdown image strings with the same alt text for all images.
	- For objects: `{"image1.jpg": "Alt 1", "image2.jpg": "Alt 2"}|image` returns Markdown image strings with alt text from the object keys.
- `link` converts strings, arrays, or objects into Markdown link syntax (not to be confused with a [[Link notes|wikilink]]).
	- For strings: `"url"|link:"author"` returns `[author](url)`.
	- For arrays: `["url1","url2"]|link:"author"` returns an array of Markdown links with the same text for all links.
	- For objects: `{"url1": "Author 1", "url2": "Author 2"}|link` returns Markdown links with the text that matches the object keys.
- `list` converts an array to a bullet list.
	- Use `list:task` to convert to a task list.
	- Use `list:numbered` to convert to a numbered list.
	- Use `list:numbered-task` to convert to a task list with numbers.
- `table` converts an array or array of objects into a Markdown table:
	- For an array of objects, it uses the object keys as headers.
	- For an array of arrays, it creates a table with each nested array as a row.
	- For a simple array, it creates a single-column table with "Value" as the header.
- `wikilink` converts strings, arrays, or objects into Obsidian wikilink syntax.
	- For strings: `"page"|wikilink` returns `[[page]]`.
	- For strings with alias: `"page"|wikilink:"alias"` returns `[[page|alias]]`.
	- For arrays: `["page1","page2"]|wikilink` returns an array of wikilinks without aliases.
	- For arrays with alias: `["page1","page2"]|wikilink:"alias"` returns an array of wikilinks with the same alias for all links.
	- For objects: `{"page1": "alias1", "page2": "alias2"}|wikilink` returns wikilinks with the keys as page names and values as aliases.

## HTML processing

Filters to process HTML content and convert HTML to Markdown. Note that your input [[Variables|variable]] must contain HTML content, e.g. using `{{fullHtml}}`, `{{contentHtml}}` or a `{{selectorHtml:}}` variable.

- `markdown` converts a string to an [[Obsidian Flavored Markdown]] formatted string.
	- Useful when combined with variables that return HTML such as `{{contentHtml}}`, `{{fullHtml}}`, and selector variables like `{{selectorHtml:cssSelector}}`.
- `remove_html` removes specified HTML elements and their content from a string.
	- Supports tag name, class, or id, e.g. `{{contentHtml|remove_html:("img,.class-name,#element-id")}}`
	- To remove only HTML tags or attributes without removing the content use the `strip_tags` or `strip_attr` filters.
- `strip_attr` removes all HTML attributes from a string.
	- Use `strip_attr:("class, id")` to keep specific attributes.
	- Example: `"<div class="test" id="example">Content</div>"|strip_attr:("class")` returns `<div id="example">Content</div>`.
- `strip_md` removes all Markdown formatting and returns a plain text string, e.g. turning `**text**` into `text`.
	- Turns formatted text into unformatted plain text, including bold, italic, highlights, headers, code, blockquotes, tables, task lists, and wikilinks.
	- Entirely removes tables, footnotes, images, and HTML elements.
- `strip_tags` removes all HTML tags from a string. Unlike `remove_html` this doesn't remove the content within the tags.
	- Use `strip_tags:("p,strong,em")` to keep specific tags.
	- Example: `"<p>Hello <b>world</b>!</p>"|strip_tags:("b")` returns `Hello <b>world</b>!`.

## Arrays and objects

Filters to process arrays and objects.

- `first` returns the first element of an array as a string.
	- `["a","b","c"]|first` returns `"a"`.
	- If the input is not an array, it returns the input unchanged.
- `join` combines elements of an array into a string.
	- `["a","b","c"]|join` returns `"a,b,c"`.
	- A custom separator can be specified: `["a","b","c"]|join:" "` returns `"a b c"`. Use `join:"\n"` to separate elements with a line break.
	- It can be useful after `split` or `slice`: `"a,b,c,d"|split:","|slice:1,3|join:" "` returns `"b c"`.
- `last` returns the last element of an array as a string.
	- `["a","b","c"]|last` returns `"c"`.
	- If the input is not an array, it returns the input unchanged.
- `map` applies a transformation to each element of an array.
	- Syntax: `map:item => item.property` or `map:item => item.nested.property` for nested properties.
		- Example: `[{gem: "obsidian", color: "black"}, {gem: "amethyst", color: "purple"}]|map:item => item.gem` returns `["obsidian", "amethyst"]`.
	- Parentheses are needed for object literals and complex expressions: `map:item => ({key: value})`.
		- Example: `[{gem: "obsidian", color: "black"}, {gem: "amethyst", color: "purple"}]|map:item => ({name: item.gem, color: item.color})`  returns `[{name: "obsidian", color: "black"}, {name: "amethyst", color: "purple"}]`.
	- String literals are supported and automatically wrapped in an object with a `str` property:
		- Example: `["rock", "pop"]|map:item => "genres/${item}"` returns `[{str: "genres/rock"}, {str: "genres/pop"}]`.
		- The `str` property is used to store the result of string literal transformations.
	- Can be combined with `template` filter, e.g. `map:item => ({name: ${item.gem}, color: item.color})|template:"- ${name} is ${color}\n"`
- `object` manipulates object data:
	- `object:array` converts an object to an array of key-value pairs.
	- `object:keys` returns an array of the object's keys.
	- `object:values` returns an array of the object's values.
	- Example: `{"a":1,"b":2}|object:array` returns `[["a",1],["b",2]]`.
- `slice` extracts a portion of a string or array.
	- For strings: `"hello"|slice:1,4` returns `"ell"`.
	- For arrays: `["a","b","c","d"]|slice:1,3` returns `["b","c"]`.
	- If only one parameter is provided, it slices from that index to the end: `"hello"|slice:2` returns `"llo"`.
	- Negative indices count from the end: `"hello"|slice:-3` returns `"llo"`.
	- The second parameter is exclusive: `"hello"|slice:1,4` includes characters at indices 1, 2, and 3.
	- Using a negative second parameter excludes elements from the end: `"hello"|slice:0,-2` returns `"hel"`.
- `split` divides a string into an array of substrings.
	- `"a,b,c"|split:","` returns `["a","b","c"]`.
	- `"hello world"|split:" "` returns `["hello","world"]`.
	- If no separator is provided, it splits on every character: `"hello"|split` returns `["h","e","l","l","o"]`.
	- Regular expressions can be used as separators: `"a1b2c3"|split:[0-9]` returns `["a","b","c"]`.
- `template` applies a template string to an object or array of objects.
	- Syntax: `object|template:"Template with ${variable}"`.
	- Access nested properties: `{"gem":{"name":"Obsidian"}}|template:"${gem.name}"` returns `"Obsidian"`.
	- For objects: `{"gem":"obsidian","hardness":5}|template:"${gem} has a hardness of ${hardness}"` returns `"obsidian has a hardness of 5"`.
	- For arrays: `[{"gem":"obsidian","hardness":5},{"gem":"amethyst","hardness":7}]|template:"- ${gem} has a hardness of ${hardness}\n"` returns a formatted list.
	- Works with string literals from `map` by accessing the `str` property:
		- Example: `["rock", "pop"]|map:item => "genres/${item}"|template:"${str}"` returns `"genres/rock\ngenres/pop"`.
		- The `str` property is automatically used when applying `template` to objects created by `map` with string literals.
