---
permalink: web-clipper/filters
---
Filters allow you to modify [[variables]] in [[Obsidian Web Clipper/Templates|Web Clipper templates]]. Filters are applied to variables using the syntax `{{variable|filter}}`.

- Filters work for any kind of [[Variables|variable]] including `prompt`, `meta`, `selector`, and `schema` variables.
- Filters can be chained, e.g. `{{variable|filter1|filter2}}`, and are applied in the order they are added.

## Dates

Convert and modify dates.

### `date`

Converts a date to the specified format, [see reference](https://day.js.org/docs/en/display/format).

- `{{date|date:"YYYY-MM-DD"}}` converts the current date to "YYYY-MM-DD".
- Use `date:("outputFormat", "inputFormat")` to specify the input format, e.g. `"12/01/2024"|date:("YYYY-MM-DD", "MM/DD/YYYY")` parses "12/01/2024" and returns `"2024-12-01"`.

### `date_modify` 

Modifies a date by adding or subtracting a specified amount of time, [see reference](https://day.js.org/docs/en/manipulate/add).

- `"2024-12-01"|date_modify:"+1 year"` returns `"2025-12-01"`
- `"2024-12-01"|date_modify:"- 2 months"` returns `"2024-10-01"`

### `duration`

Converts ISO 8601 duration strings or seconds into formatted time strings. Uses tokens: `HH` (padded hours), `H` (hours), `mm` (padded minutes), `m` (minutes), `ss` (padded seconds), `s` (seconds).

- `"PT1H30M"|duration:"HH:mm:ss"` returns `"01:30:00"`.
- `"3665"|duration:"H:mm:ss"` returns `"1:01:05"`.
- Setting `duration` without any parameters uses `HH:mm:ss` over 1 hour, `mm:ss` under 1 hour.
- Supports both ISO 8601 duration strings (e.g., `PT6702S`, `PT1H30M`) and plain seconds.

## Text conversion and capitalization

Convert text strings from one format to another.

### `camel`

Converts text to `camelCase`.

### `capitalize`

Capitalizes the first character of the value and converts the rest to lowercase, e.g. `"hELLO wORLD"|capitalize` returns `"Hello world"`.

### `kebab`

Converts text to `kebab-case`.

### `lower`

Converts text to `lowercase`.

### `pascal`

Converts text to `PascalCase`.

### `replace`

Replaces occurrences of specified text:

- Simple replacement: `"hello!"|replace:",":""` removes all commas.
- Multiple replacements: `"hello world"|replace:("e":"a","o":"0")` returns `"hall0 w0rld"`.
- Replacements are applied in the order they are specified.
- To remove specified text, use `""` as the replacement value.
- Special characters including `: | { } ( ) ' "` should be escaped with a backslash when used in the search term, e.g. `\:` to search for a literal colon.

Regex is supported using JavaScript regex syntax:

- Replace all vowels: `"hello world"|replace:"/[aeiou]/g":"*"` → `"h*ll* w*rld".`
- Case-insensitive: `"HELLO world"|replace:"/hello/i":"hi"` → `"hi world".`
- Multiple regex: `"hello world"|replace:("/[aeiou]/g":"*","/\s+/":"-")` → `"h*ll*-w*rld"`.
- Available flags: `g` (global), `i` (case-insensitive), `m` (multiline), `s` (dotAll), `u` (unicode), `y` (sticky).

### `safe_name`

Converts text to a safe file name.

- By default, `safe_name` applies the most conservative sanitization rules.
- OS-specific rules can be applied with `safe_name:os` where `os` can be `windows`, `mac`, or `linux` to only apply the rules for that operating system.

### `snake`

Converts text to `snake_case`.

### `title`

Converts text to `Title Case`, e.g. `"hello world"|title` returns `"Hello World"`.

### `trim`

Removes white space from both ends of a string.

- `"  hello world  "|trim` returns `"hello world"`.

### `uncamel`

Converts camelCase or PascalCase to space-separated words, which you can further format with other filters like `title` or `capitalize`.

- `"camelCase"|uncamel` returns `"camel case"`.
- `"PascalCase"|uncamel` returns `"pascal case"`.

### `upper`

Converts a value to uppercase, e.g. `"hello world"|upper` returns `"HELLO WORLD"`.

## Text formatting

Apply [[Basic formatting syntax]] and [[Advanced formatting syntax]] to text.

### `blockquote` 

Adds a Markdown quote prefix (`> `) to each line of the input.

### `callout`

Creates a [[Callouts|callout]] with optional parameters: `{{variable|callout:("type", "title", foldState)}}`

- `type` is the callout type, and defaults to "info"
- `title` is the callout title, and defaults to empty
- `foldState` is a boolean to set the fold state (true for folded, false for unfolded, null for not foldable)

### `footnote`

Converts an array or object into a list of Markdown footnotes.

- For arrays: `["first item","second item"]|footnote` returns: `[^1]: first item` etc.
- For objects: `{"First Note": "Content 1", "Second Note": "Content 2"}|footnote` returns: `[^first-note]: Content 1` etc.

### `fragment_link`

Converts strings and arrays into [text fragment](https://developer.mozilla.org/en-US/docs/Web/URI/Fragment/Text_fragments) links. Defaults to "link" for the link text.

- `highlights|fragment_link` returns `Highlight content [link](text-fragment-url)`
- `highlights|fragment_link:"custom title"` returns `Highlight content [custom title](text-fragment-url)`

### `image` 

Converts strings, arrays, or objects into Markdown image syntax.

- For strings: `"image.jpg"|image:"alt text"` returns `![alt text](image.jpg)`.
- For arrays: `["image1.jpg","image2.jpg"]|image:"alt text"` returns an array of Markdown image strings with the same alt text for all images.
- For objects: `{"image1.jpg": "Alt 1", "image2.jpg": "Alt 2"}|image` returns Markdown image strings with alt text from the object keys.

### `link`

Converts strings, arrays, or objects into Markdown link syntax (not to be confused with [[Filters#`wikilink`|wikilink]]).

- For strings: `"url"|link:"author"` returns `[author](url)`.
- For arrays: `["url1","url2"]|link:"author"` returns an array of Markdown links with the same text for all links.
- For objects: `{"url1": "Author 1", "url2": "Author 2"}|link` returns Markdown links with the text that matches the object keys.

### `list`

Converts an array to a Markdown list.

- `list` to convert to a bullet list.
- `list:task` to convert to a task list.
- `list:numbered` to convert to a numbered list.
- `list:numbered-task` to convert to a task list with numbers.

### `table`

Converts an array or array of objects into a [[Advanced formatting syntax#Tables|Markdown table]]:

- For an array of objects, it uses the object keys as headers.
- For an array of arrays, it creates a table with each nested array as a row.
- For a simple array, it creates a single-column table with "Value" as the header.
- Custom column headers can be specified using: `table:("Column 1", "Column 2", "Column 3")`. When used with a simple array, it automatically breaks the data into rows based on the number of columns specified.

### `wikilink`

Converts strings, arrays, or objects into Obsidian [[Link notes|wikilink]] syntax.

- For strings: `"page"|wikilink` returns `[[page]]`.
- For strings with alias: `"page"|wikilink:"alias"` returns `[[page|alias]]`.
- For arrays: `["page1","page2"]|wikilink` returns an array of wikilinks without aliases.
- For arrays with alias: `["page1","page2"]|wikilink:"alias"` returns an array of wikilinks with the same alias for all links.
- For objects: `{"page1": "alias1", "page2": "alias2"}|wikilink` returns wikilinks with the keys as page names and values as aliases.

## Numbers

### `calc`

Performs basic arithmetic operations on numbers.

- Supports operators: `+`, `-`, `*`, `/`, `**` (or `^`) for exponentiation.
- Example: `"5"|calc:"+10"` returns `"15"`.
- Example: `"2"|calc:"**3"` returns `"8"` (2 cubed).
- Returns the original string if the input is not a number.

### `length`

Returns the length of strings, arrays, or number of keys in objects.

- For strings: `"hello"|length` returns `"5".`
- For arrays: `["a","b","c"]|length` returns `"3".`
- For objects: `{"a":1,"b":2}|length` returns `"2"`.

### `round`

Rounds a number to the nearest integer or to a specified number of decimal places.

- Without parameters: `3.7|round` returns `4`.
- With decimal places specified: `3.14159|round:2` returns `3.14`.

## HTML processing

Process HTML content and convert HTML to Markdown. Note that your input [[Variables|variable]] must contain HTML content, e.g. using `{{fullHtml}}`, `{{contentHtml}}` or a `{{selectorHtml:}}` variable.

### `markdown` 

Converts a string to an [[Obsidian Flavored Markdown]] formatted string.

- Useful when combined with variables that return HTML such as `{{contentHtml}}`, `{{fullHtml}}`, and selector variables like `{{selectorHtml:cssSelector}}`.

### `remove_attr` 

Removes only the specified HTML attributes from tags.

- Example: `"<div class="test" id="example">Content</div>"|remove_attr:"class"` returns `<div id="example">Content</div>`.
- Multiple attributes: `{{contentHtml|remove_attr:("class,style,id")}}`

### `remove_html`

Removes the specified HTML elements and their content from a string.

- Supports tag name, class, or id, e.g. `{{contentHtml|remove_html:("img,.class-name,#element-id")}}`
- To remove only HTML tags or attributes without removing the content use the `strip_tags` or `strip_attr` filters.

### `remove_tags` 

Removes only the specified HTML tags. Keeps the content of the tags.

- Example: `"<p>Hello <b>world</b>!</p>"|remove_tags:"b"` returns `"<p>Hello world!</p>"`.
- Multiple tags: `{{contentHtml|remove_tags:("a,em,strong")}}`

### `replace_tags`

Replaces HTML tags, maintaining the content and attributes of the tag.

- `{{contentHtml|replace_tags:"strong":"h2"}}` replaces all `<strong>` tags with `<h2>`.

### `strip_attr`

Removes **all** HTML attributes from a string.

- Use `strip_attr:("class, id")` to keep specific attributes.
- Example: `"<div class="test" id="example">Content</div>"|strip_attr:("class")` returns `<div id="example">Content</div>`.

### `strip_md`

Removes **all** Markdown formatting and returns a plain text string, e.g. turning `**text**` into `text`.

- Turns formatted text into unformatted plain text, including bold, italic, highlights, headers, code, blockquotes, tables, task lists, and wikilinks.
- Entirely removes tables, footnotes, images, and HTML elements.

### `strip_tags`

Removes **all** HTML tags from a string. Content within the tag is preserved.

- Use `strip_tags:("p,strong,em")` to keep specific tags.
- Example: `"<p>Hello <b>world</b>!</p>"|strip_tags:("b")` returns `Hello <b>world</b>!`.

## Arrays and objects

Process arrays and objects.

### `first` 

Returns the first element of an array as a string.

- `["a","b","c"]|first` returns `"a"`.
- If the input is not an array, it returns the input unchanged.

### `join`

Combines elements of an array into a string.

- `["a","b","c"]|join` returns `"a,b,c"`.
- A custom separator can be specified: `["a","b","c"]|join:" "` returns `"a b c"`. Use `join:"\n"` to separate elements with a line break.
- It can be useful after `split` or `slice`: `"a,b,c,d"|split:","|slice:1,3|join:" "` returns `"b c"`.

### `last`

Returns the last element of an array as a string.

- `["a","b","c"]|last` returns `"c"`.
- If the input is not an array, it returns the input unchanged.

### `map`

Applies a transformation to each element of an array using the syntax `map:item => item.property` or `map:item => item.nested.property` for nested properties.

- `[{gem: "obsidian", color: "black"}, {gem: "amethyst", color: "purple"}]|map:item => item.gem` returns `["obsidian", "amethyst"]`.
- Use parentheses for object literals and complex expressions: `map:item => ({key: value})`, e.g.: `[{gem: "obsidian", color: "black"}, {gem: "amethyst", color: "purple"}]|map:item => ({name: item.gem, color: item.color})`  returns `[{name: "obsidian", color: "black"}, {name: "amethyst", color: "purple"}]`.

String literals are supported and automatically wrapped in an object with a `str` property. The `str` property is used to store the result of string literal transformations, e.g. `["rock", "pop"]|map:item => "genres/${item}"` returns `[{str: "genres/rock"}, {str: "genres/pop"}]`.

Combine `map` with the `template` filter, e.g. `map:item => ({name: ${item.gem}, color: item.color})|template:"- ${name} is ${color}\n"`.

### `merge`

Adds new values to an array.

- For arrays: `["a","b"]|merge:("c","d")` returns `["a","b","c","d"]`.
- Single value: `["a","b"]|merge:"c"` returns `["a","b","c"]`.
- If input is not an array, it creates a new array: `"a"|merge:("b","c")` returns `["a","b","c"]`.
- Values can be quoted: `["a"]|merge:('b,"c,d",e')` returns `["a","b","c,d","e"]`.

### `nth`

Keeps nth items in an array using CSS-style nth-child syntax and group patterns. All positions are 1-based (first item is position 1).

- `array|nth:3` keeps only the 3rd element.
- `array|nth:3n` keeps every 3rd element (3, 6, 9, etc.).
- `array|nth:n+3` keeps the 3rd and all following elements.

Group pattern syntax for repeating structures:

- `array|nth:1,2,3:5` keeps positions 1,2,3 from each group of 5 items. Example: `[1,2,3,4,5,6,7,8,9,10]|nth:1,2,3:5` returns `[1,2,3,6,7,8]`.

### `object`

Manipulates object data:

- `object:array` converts an object to an array of key-value pairs.
- `object:keys` returns an array of the object's keys.
- `object:values` returns an array of the object's values.
- Example: `{"a":1,"b":2}|object:array` returns `[["a",1],["b",2]]`.

### `slice`

Extracts a portion of a string or array.

- For strings: `"hello"|slice:1,4` returns `"ell"`.
- For arrays: `["a","b","c","d"]|slice:1,3` returns `["b","c"]`.
- If only one parameter is provided, it slices from that index to the end: `"hello"|slice:2` returns `"llo"`.
- Negative indices count from the end: `"hello"|slice:-3` returns `"llo"`.
- The second parameter is exclusive: `"hello"|slice:1,4` includes characters at indices 1, 2, and 3.
- Using a negative second parameter excludes elements from the end: `"hello"|slice:0,-2` returns `"hel"`.

### `split`

Divides a string into an array of substrings.

- `"a,b,c"|split:","` returns `["a","b","c"]`.
- `"hello world"|split:" "` returns `["hello","world"]`.
- If no separator is provided, it splits on every character: `"hello"|split` returns `["h","e","l","l","o"]`.
- Regular expressions can be used as separators: `"a1b2c3"|split:[0-9]` returns `["a","b","c"]`.

### `template`

Applies a template string to an object or array of objects, using the syntax `object|template:"Template with ${variable}"`.

- Access nested properties: `{"gem":{"name":"Obsidian"}}|template:"${gem.name}"` returns `"Obsidian"`.
- For objects: `{"gem":"obsidian","hardness":5}|template:"${gem} has a hardness of ${hardness}"` returns `"obsidian has a hardness of 5"`.
- For arrays: `[{"gem":"obsidian","hardness":5},{"gem":"amethyst","hardness":7}]|template:"- ${gem} has a hardness of ${hardness}\n"` returns a formatted list.

Works with string literals from `map` by accessing the `str` property:

- Example: `["rock", "pop"]|map:item => "genres/${item}"|template:"${str}"` returns `"genres/rock\ngenres/pop"`.
- The `str` property is automatically used when applying `template` to objects created by `map` with string literals.

### `unique`

Removes duplicate values from arrays and objects.

- For arrays of primitives: `[1,2,2,3,3]|unique` returns `[1,2,3]`.
- For arrays of objects: `[{"a":1},{"b":2},{"a":1}]|unique` returns `[{"a":1},{"b":2}]`.
- For objects it removes properties with duplicate values, keeping the last occurrence's key.
- For strings it returns the input unchanged.