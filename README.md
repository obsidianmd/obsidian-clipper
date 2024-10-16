⚠️ **Obsidian Web Clipper is still in beta and requires Obsidian 1.7.2.** Please make sure you are using Obsidian 1.7.2 or above.

## Features

- **Customizable templates.** Create templates to automatically extract and organize metadata from web pages.
- **Smart triggers.** Set up rules to automatically apply the right template based on the website you're clipping from.
- **No lock-in.** All your clips are saved in clean, durable, portable Markdown format — no proprietary formats, no lock-in, and available to you offline.

## Getting started

Install the extension by downloading it from the official directory for your browser:

- **[Chrome Web Store](https://chromewebstore.google.com/detail/obsidian-web-clipper/cnjifjpddelmedmihgijeibhnjfabmlf)** for Chrome, Brave, Edge, Arc, Orion, and other Chromium-based browsers.
- **[Firefox Add-Ons](https://addons.mozilla.org/en-US/firefox/addon/web-clipper-obsidian/)** for Firefox and Firefox Mobile.
- **[Safari Extensions](https://apps.apple.com/us/app/obsidian-web-clipper/id6720708363)** for macOS, iOS, and iPadOS.

If you want to install the extension manually, go to [releases](https://github.com/obsidianmd/obsidian-clipper/releases) and download the latest version.

- **Firefox:** go to `about:debugging#/runtime/this-firefox` and click **Load Temporary Add-on** and select the `.zip` file
- **Chrome:** drag and drop the `.zip` in `chrome://extensions/`
- **Edge:** drag and drop the Chrome version `.zip` in `edge://extensions/`
- **Brave:** drag and drop the Chrome version `.zip` in `brave://extensions/`

On Linux, make sure that Obsidian URI is registered. [See instructions on the Obsidian Help site.](https://help.obsidian.md/Extending+Obsidian/Obsidian+URI#Register+Obsidian+URI)

## Using templates

Some example templates are available in the [clipper-templates repo](https://github.com/kepano/clipper-templates). 

### Import and export clipper templates

To import a template:

1. Open the extension and click the **Settings** cog icon.
2. Go to any template in the list.
3. Click **Import** in the top right or.drag and drop your `.json` template file(s) anywhere in the template area.

To export a template click **Export** in the top right. This will download the template `.json` file.

### Template triggers

Template triggers allow you to automatically select a template based on the current page URL or schema.org data. You can define multiple rules for each template, separated by a new line.

#### Simple URL matching

Simple matching triggers a template if the current page URL *starts with* the given pattern. For example:

- `https://obsidian.md` will match any URL that starts with this text.

#### Regular expression matching

You can trigger templates based on more complex URL patterns using regular expressions. Enclose your regex pattern in forward slashes (`/`). Remember to escape special characters in regex patterns (like `.` and `/`) with a backslash (`\`). For example:

- `/^https:\/\/www\.imdb\.com\/title\/tt\d+\/reference\/?$/` will match any IMDB reference page.

#### Schema.org matching

You can trigger templates based on schema.org data present on the page. Use the `schema:` prefix followed by the schema key you want to match. You can optionally specify an expected value. For example:

- `schema:@Recipe` will match pages where the schema type is "Recipe".
- `schema:@Recipe.name` will match pages where `@Recipe.name` is present.
- `schema:@Recipe.name=Cookie` will match pages where `@Recipe.name` is "Cookie".

You can combine different types of patterns for a single template. The first matching pattern (whether URL-based or schema-based) will determine which template is used.

### Template variables

Template variables can be used to automatically pre-populate data from the page in a template. Variables can be used in the **note name**, **note location**, **properties**, and **note content**. Use the `...` icon in the extension popup to access the current page variable for use in templates. There are several types of variables you can use: preset variables, meta variables, selector variables, and schema variables.

#### Preset variables

Preset variables are automatically generated based on the page content. These should work for nearly all websites. The main content variable is `{{content}}`, which contains the article content, or the highlights, or the selection if there is any selected text on the page. Note that `{{content}}` attempts to extract the main content of the page, which may not always be what you want. In that case, you can use other preset variables or selector variables to extract the content you need.

| Variable            | Description                                                   |
| ------------------- | ------------------------------------------------------------- |
| `{{author}}`        | Author of the page                                            |
| `{{content}}`       | Article content, highlights, or selection, in Markdown format |
| `{{contentHtml}}`   | Article content, highlights, or selection, in HTML format     |
| `{{date}}`          | Current date                                                  |
| `{{description}}`   | Description or excerpt                                        |
| `{{domain}}`        | Domain                                                        |
| `{{fullHtml}}`      | Unprocessed HTML for the full page content                    |
| `{{highlights}}`    | Highlights with text and timestamps                           |
| `{{image}}`         | Social share image URL                                        |
| `{{published}}`     | Published date                                                |
| `{{site}}`          | Site name or publisher                                        |
| `{{title}}`         | Title of the page                                             |
| `{{time}}`          | Current date and time                                         |
| `{{url}}`           | Current URL                                                   |

#### Meta variables

Meta variables allow you to extract data from meta tags in the page, including Open Graph data used to populate social share previews.

- `{{meta:name}}` returns the content of the meta name tag with the given name, e.g. `{{meta:name:description}}` for the `description` meta tag.
- `{{meta:property}}` returns the content of the meta property tag with the given property, e.g. `{{meta:property:og:title}}` for the `og:title` meta tag.

#### Selector variables

Selector variables allow you to extract text content from elements on the page using the syntax `{{selector:cssSelector?attribute}}`, where `?attribute` is optional. If no attribute is specified, the text content of the element is returned. You can also use `{{selectorHtml:cssSelector}}` to get the HTML content of the element. Selector variables tend to work best on a specific website or set of websites that have consistent HTML structure.

- `{{selector:h1}}` returns text content of the first `h1` element on the page.
- `{{selector:.author}}` returns text content of the first `.author` element on the page.
- `{{selector:img.hero?src}}` returns the `src` attribute of the first image with class `hero`.
- `{{selector:a.main-link?href}}` returns the `href` attribute of the first anchor tag with class `main-link`.
- `{{selectorHtml:body|markdown}}` returns the entire HTML of the `body` element, converted to Markdown using the `markdown` filter.
- Nested CSS selectors and combinators are supported if you need more specificity.
- If multiple elements match the selector, an array is returned, which you can process with filters like `join` or `map`.

#### Schema.org variables

Schema variables allow you to extract data from [schema.org](https://schema.org/) JSON-LD on the page.

- `{{schema:@Type:key}}` returns the value of the key from the schema.
- `{{schema:@Type:parent.child}}` returns the value of a nested property.
- `{{schema:@Type:arrayKey}}` returns the first item in an array.
- `{{schema:@Type:arrayKey[index].property}}` returns the item at the specified index in an array.
- `{{schema:@Type:arrayKey[*].property}}` returns a specific property from all items in an array.

You can also use a shorthand notation without specifying the schema type:

- `{{schema:author}}` will match the first `author` property found in any schema type.
- `{{schema:name}}` will match the first `name` property found in any schema type.

This shorthand is particularly useful when you don't know or don't care about the specific schema type, but you know the property name you're looking for.

Nested properties and array access work as well, both with and without the schema `@Type` specified:

- `{{schema:author.name}}` will find the first `author` property and then access its `name` sub-property.
- `{{schema:author[0].name}}` will access the `name` of the first author in an array of authors.
- `{{schema:author[*].name}}` will return an array of all author names.

### Filters

Filters allow you to modify variables in a template. Filters are applied to variables using the syntax `{{variable|filter}}`.

- Filters work for any kind of variable including those that use the `selector` or `schema` prefix.
- Filters can be chained, e.g. `{{variable|filter1|filter2}}`, and are applied in the order they are added.

#### Available filters

- `blockquote` adds a Markdown quote prefix (`> `) to each line of the input.
- `callout` creates a [callout](https://help.obsidian.md/Editing+and+formatting/Callouts) with optional parameters: `{{variable|callout:("type", "title", foldState)}}`
	- `type` is the callout type, and defaults to "info"
	- `title` is the callout title, and defaults to empty
	- `foldState` is a boolean to set the fold state (true for folded, false for unfolded, null for not foldable)
- `capitalize` capitalizes the first character of the value and converts the rest to lowercase, e.g. `"hELLO wORLD"|capitalize` returns `"Hello world"`.
- `camel` converts text to `camelCase`.
- `date` converts a date to the specified format, [see reference](https://day.js.org/docs/en/display/format).
	- `date:"YYYY-MM-DD"` converts a date to "YYYY-MM-DD".
	- Use `date:("outputFormat", "inputFormat")` to specify the input format, e.g. `"12/01/2024"|date:("YYYY-MM-DD", "MM/DD/YYYY")` parses "12/01/2024" and returns `"2024-12-01"`.
- `date_modify` modifies a date by adding or subtracting a specified amount of time, [see reference](https://day.js.org/docs/en/manipulate/add).
	- `"2024-12-01"|date_modify:"+1 year"` returns `"2025-12-01"`
	- `"2024-12-01"|date_modify:"- 2 months"` returns `"2024-10-01"`
- `first` returns the first element of an array as a string.
	- `["a","b","c"]|first` returns `"a"`.
	- If the input is not an array, it returns the input unchanged.
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
- `join` combines elements of an array into a string.
	- `["a","b","c"]|join` returns `"a,b,c"`.
	- A custom separator can be specified: `["a","b","c"]|join:" "` returns `"a b c"`.
	- It can be useful after `split` or `slice`: `"a,b,c,d"|split:","|slice:1,3|join:" "` returns `"b c"`.
- `kebab` converts text to `kebab-case`.
- `last` returns the last element of an array as a string.
	- `["a","b","c"]|last` returns `"c"`.
	- If the input is not an array, it returns the input unchanged.
- `link` converts strings, arrays, or objects into Markdown link syntax (not to be confused with wikilinks).
	- For strings: `"url"|link:"author"` returns `[author](url)`.
	- For arrays: `["url1","url2"]|link:"author"` returns an array of Markdown links with the same text for all links.
	- For objects: `{"url1": "Author 1", "url2": "Author 2"}|link` returns Markdown links with the text that matches the object keys.
- `list` converts an array to a bullet list.
	- Use `list:task` to convert to a task list.
	- Use `list:numbered` to convert to a numbered list.
	- Use `list:numbered-task` to convert to a task list with numbers.
- `lower` converts a string to lowercase.
- `map` applies a transformation to each element of an array.
	- Syntax: `map:item => item.property` or `map:item => item.nested.property` for nested properties.
		- Example: `[{gem: "obsidian", color: "black"}, {gem: "amethyst", color: "purple"}]|map:item => item.gem` returns `["obsidian", "amethyst"]`.
	- Parentheses are needed for object literals and complex expressions: `map:item => ({key: value})`.
		- Example: `[{gem: "obsidian", color: "black"}, {gem: "amethyst", color: "purple"}]|map:item => ({name: item.gem, hex: item.color === "black" ? "#000" : "#800080"})`  returns `[{name: "obsidian", hex: "#000"}, {name: "amethyst", hex: "#800080"}]`.
	- String literals are supported and automatically wrapped in an object with a `str` property:
		- Example: `["rock", "pop"]|map:item => "genres/${item}"` returns `[{str: "genres/rock"}, {str: "genres/pop"}]`.
		- The `str` property is used to store the result of string literal transformations.
	- Can be combined with `template` filter, e.g. `map:item => ({name: ${item.gem}, color: item.color})|template:"- ${name} is ${color}\n"`
- `markdown` converts a string to an [Obsidian Flavored Markdown](https://help.obsidian.md/Editing+and+formatting/Obsidian+Flavored+Markdown) formatted string.
	- Useful when combined with variables that return HTML such as `{{contentHtml}}`, `{{fullHtml}}`, and selector variables like `{{selectorHtml:cssSelector}}`.
- `object` manipulates object data:
	- `object:array` converts an object to an array of key-value pairs.
	- `object:keys` returns an array of the object's keys.
	- `object:values` returns an array of the object's values.
	- Example: `{"a":1,"b":2}|object:array` returns `[["a",1],["b",2]]`.
- `pascal` converts text to `PascalCase`.
- `remove_html` removes specified HTML elements and their content from a string.
	- Supports tag name, class, or id, e.g. `{{content|remove_html:("img,.class-name,#element-id")}}`
	- To remove only HTML tags or attributes without removing the content use the `strip_tags` or `strip_attr` filters.
- `replace` replaces occurrences of specified strings:
	- Simple replacement: `"hello!"|replace:",":""` removes all commas.
	- Multiple replacements: `"hello world"|replace:("e":"a","o":"0")` returns `"hall0 w0rld"`.
	- Replacements are applied in the order they are specified.
	- To replace with an empty string, use `""` as the replacement value.
	- Special characters including `: | { } ( ) ' "` should be escaped with a backslash when used in the search term, e.g. `\:` to search for a literal colon.
- `safe_name` sanitizes a string to be used as a safe file name.
	- By default, `safe_name` applies the most conservative sanitization rules.
	- OS-specific usage: `safe_name:os` where `os` can be `windows`, `mac`, or `linux` to only apply the rules for that operating system.
- `slice` extracts a portion of a string or array.
	- For strings: `"hello"|slice:1,4` returns `"ell"`.
	- For arrays: `["a","b","c","d"]|slice:1,3` returns `["b","c"]`.
	- If only one parameter is provided, it slices from that index to the end: `"hello"|slice:2` returns `"llo"`.
	- Negative indices count from the end: `"hello"|slice:-3` returns `"llo"`.
	- The second parameter is exclusive: `"hello"|slice:1,4` includes characters at indices 1, 2, and 3.
	- Using a negative second parameter excludes elements from the end: `"hello"|slice:0,-2` returns `"hel"`.
- `snake` converts text to `snake_case`.
- `split` divides a string into an array of substrings.
	- `"a,b,c"|split:","` returns `["a","b","c"]`.
	- `"hello world"|split:" "` returns `["hello","world"]`.
	- If no separator is provided, it splits on every character: `"hello"|split` returns `["h","e","l","l","o"]`.
	- Regular expressions can be used as separators: `"a1b2c3"|split:[0-9]` returns `["a","b","c"]`.
- `strip_attr` removes all HTML attributes from a string.
	- Use `strip_attr:("class, id")` to keep specific attributes.
	- Example: `"<div class="test" id="example">Content</div>"|strip_attr:("class")` returns `<div id="example">Content</div>`.
- `strip_md` removes all Markdown formatting and returns a plain text string, e.g. turning `**text**` into `text`.
	- Turns formatted text into unformatted plain text, including bold, italic, highlights, headers, code, blockquotes, tables, task lists, and wikilinks.
	- Entirely removes tables, footnotes, images, and HTML elements.
- `strip_tags` removes all HTML tags from a string. Unlike `remove_html` this doesn't remove the content within the tags.
	- Use `strip_tags:("p,strong,em")` to keep specific tags.
	- Example: `"<p>Hello <b>world</b>!</p>"|strip_tags:("b")` returns `Hello <b>world</b>!`.
- `table` converts an array or array of objects into a Markdown table:
	- For an array of objects, it uses the object keys as headers.
	- For an array of arrays, it creates a table with each nested array as a row.
	- For a simple array, it creates a single-column table with "Value" as the header.
- `template` applies a template string to an object or array of objects.
	- Syntax: `object|template:"Template with ${variable}"`.
	- Access nested properties: `{"gem":{"name":"Obsidian"}}|template:"${gem.name}"` returns `"Obsidian"`.
	- For objects: `{"gem":"obsidian","hardness":5}|template:"${gem} has a hardness of ${hardness}"` returns `"obsidian has a hardness of 5"`.
	- For arrays: `[{"gem":"obsidian","hardness":5},{"gem":"amethyst","hardness":7}]|template:"- ${gem} has a hardness of ${hardness}\n"` returns a formatted list.
	- Works with string literals from `map` by accessing the `str` property:
		- Example: `["rock", "pop"]|map:item => "genres/${item}"|template:"${str}"` returns `"genres/rock\ngenres/pop"`.
		- The `str` property is automatically used when applying `template` to objects created by `map` with string literals.
- `title` returns a titlecased version of the value, e.g. `"hello world"|title` returns `"Hello World"`.
- `trim` removes whitespace from both ends of a string.
	- `"  hello world  "|trim` returns `"hello world"`.
- `uncamel` converts camelCase or PascalCase to space-separated words, which you can further format with other filters like `title` or `capitalize`.
	- `"camelCase"|uncamel` returns `"camel case"`.
	- `"PascalCase"|uncamel` returns `"pascal case"`.
- `upper` converts a value to uppercase, e.g. `"hello world"|upper` returns `"HELLO WORLD"`.
- `wikilink` converts strings, arrays, or objects into Obsidian wikilink syntax.
	- For strings: `"page"|wikilink` returns `[[page]]`.
	- For strings with alias: `"page"|wikilink:"alias"` returns `[[page|alias]]`.
	- For arrays: `["page1","page2"]|wikilink` returns an array of wikilinks without aliases.
	- For arrays with alias: `["page1","page2"]|wikilink:"alias"` returns an array of wikilinks with the same alias for all links.
	- For objects: `{"page1": "alias1", "page2": "alias2"}|wikilink` returns wikilinks with the keys as page names and values as aliases.

## Building the extension

To build the extension:

```
npm run build
```

This will create three directories:
- `dist/` for the Chromium version
- `dist_firefox/` for the Firefox version
- `dist_safari/` for the Safari version

### Installing in Chrome, Brave, Edge, and Arc

1. Open your browser and navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist` directory

### Installing in Firefox

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Navigate to the `dist_firefox` directory and select the `manifest.json` file

## Third-party libraries

- [webextension-polyfill](https://github.com/mozilla/webextension-polyfill) for browser compatibility
- [readability](https://github.com/mozilla/readability) for content extraction
- [turndown](https://github.com/mixmark-io/turndown) for HTML to Markdown conversion
- [dayjs](https://github.com/iamkun/dayjs) for date parsing and formatting
- [lz-string](https://github.com/pieroxy/lz-string) to compress templates to reduce storage space
- [lucide](https://github.com/lucide-icons/lucide) for icons
- [mathml-to-latex](https://github.com/asnunes/mathml-to-latex) for MathML to LaTeX conversion
