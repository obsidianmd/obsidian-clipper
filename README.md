Official Obsidian browser extension. Available for Chrome, Firefox, Edge, Brave, and Arc. Support for Safari to come.

## Features

- **Customizable templates.** Create templates to automatically extract and organize metadata from web pages.
- **Smart triggers.** Set up rules to automatically apply the right template based on the website you're clipping from.
- **Plain text.** All your clips are saved in clean, durable, portable Markdown format — no proprietary formats, no lock-in, and available to you offline.

## Getting started

The extension is not yet available across the official directories as it is still in beta. Go to [releases](https://github.com/obsidianmd/obsidian-clipper/releases) and download the latest version for your browser.

- **Firefox:** go to `about:debugging#/runtime/this-firefox` and click **Load Temporary Add-on** and select the `.zip` file
- **Chrome:** drag and drop the `.zip` in `chrome://extensions/`
- **Edge:** drag and drop the `.zip` in `edge://extensions/`
- **Brave:** drag and drop the `.zip` in `brave://extensions/`

## Using templates

Some example templates are available in the [clipper-templates repo](https://github.com/kepano/clipper-templates). 

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

- `schema:@type` will match any page that has a schema.org `@type` property.
- `schema:@type=Recipe` will match pages where the schema.org `@type` is specifically "Recipe".

Schema matching is particularly useful for selecting templates based on the type of content on the page, regardless of the specific URL structure.

You can combine different types of patterns for a single template. The first matching pattern (whether URL-based or schema-based) will determine which template is used.

### Template variables

Template variables can be used to automatically pre-populate data from the page in a template. Variables can be used in the **note name**, **note location**, **properties**, and **note content**. Use the `...` icon in the extension popup to access the current page variable for use in templates.

#### Page variables

These variables are automatically generated based on the page content.

| Variable          | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `{{author}}`      | Author of the page                                   |
| `{{content}}`     | Article content, or the selection if present         |
| `{{date}}`        | Today's date                                         |
| `{{description}}` | Description or excerpt                               |
| `{{domain}}`      | Domain                                               |
| `{{fullHtml}}`    | Full HTML content of the page                        |
| `{{image}}`       | Social share image URL                               |
| `{{published}`    | Published date                                       |
| `{{title}}`       | Title of the page                                    |
| `{{url}}`         | Current URL                                          |

#### Meta variables

Meta variables allow you to extract data from meta tags in the page.

- `{{meta:name}}` returns the content of the meta name tag with the given name, e.g. `{{meta:name:description}}` for the `description` meta tag.
- `{{meta:property}}` returns the content of the meta property tag with the given property, e.g. `{{meta:property:og:title}}` for the `og:title` meta tag.

#### Selector variables

Selector variables allow you to extract data from elements on the page using the syntax `{{selector:cssSelector:attribute}}`, where `:attribute` is optional. If no attribute is specified, the text content of the element is returned.

- `{{selector:h1}}` returns text content of the first `h1` element on the page.
- `{{selector:.author}}` returns text content of the first `.author` element on the page.
- `{{selector:img.hero:src}}` returns the `src` attribute of the first image with class `hero`.
- `{{selector:a.main-link:href}}` returns the `href` attribute of the first anchor tag with class `main-link`.
- Nested CSS selectors and combinators are supported if you need more specificity.

#### Schema.org variables

Schema variables allow you to extract data from [schema.org](https://schema.org/) JSON-LD on the page.

- `{{schema:key}}` returns the value of the key from the schema.
- `{{schema:parent.child}}` returns the value of a nested property.
- `{{schema:arrayKey}}` returns the first item in an array.
- `{{schema:arrayKey[index].property}}` returns the item at the specified index in an array.
- `{{schema:arrayKey[*].property}}` returns a specific property from all items in an array.

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
- `date` converts a date to the specified format such as `date:"YYYY-MM-DD"`, [see reference](https://day.js.org/docs/en/display/format).
- `first` returns the first element of an array as a string.
	- `["a","b","c"]|first` returns `"a"`.
	- If the input is not an array, it returns the input unchanged.
- `join` combines elements of an array into a string.
	- `["a","b","c"]|join` returns `"a,b,c"`.
	- A custom separator can be specified: `["a","b","c"]|join:" "` returns `"a b c"`.
	- It can be useful after `split` or `slice`: `"a,b,c,d"|split:","|slice:1,3|join:" "` returns `"b c"`.
- `kebab` converts text to `kebab-case`.
- `last` returns the last element of an array as a string.
	- `["a","b","c"]|last` returns `"c"`.
	- If the input is not an array, it returns the input unchanged.
- `list` converts an array to a bullet list.
	- Use `list:task` to convert to a task list.
	- Use `list:numbered` to convert to a numbered list.
	- Use `list:numbered-task` to convert to a task list with numbers.
- `markdown` converts a string to an [Obsidian Flavored Markdown](https://help.obsidian.md/Editing+and+formatting/Obsidian+Flavored+Markdown) formatted string.
- `object` manipulates object data:
	- `object:array` converts an object to an array of key-value pairs.
	- `object:keys` returns an array of the object's keys.
	- `object:values` returns an array of the object's values.
	- Example: `{"a":1,"b":2}|object:array` returns `[["a",1],["b",2]]`.
- `pascal` converts text to `PascalCase`.
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
- `table` converts an array or array of objects into a Markdown table:
	- For an array of objects, it uses the object keys as headers.
	- For an array of arrays, it creates a table with each nested array as a row.
	- For a simple array, it creates a single-column table with "Value" as the header.
- `title` returns a titlecased version of the value, e.g. `"hello world"|title` returns `"Hello World"`.
- `trim` removes whitespace from both ends of a string.
	- `"  hello world  "|trim` returns `"hello world"`.
- `upper` converts a value to uppercase, e.g. `"hello world"|upper` returns `"HELLO WORLD"`.
- `wikilink` adds double brackets around strings and array items, e.g. `"hello"|wikilink` returns `"[[hello]]"`.

## Building the extension

To build the extension for Chromium browsers and Firefox:

```
npm run build
```

This will create two directories:
- `dist/` for the Chromium version
- `dist_firefox/` for the Firefox version

### Installing in Chrome, Brave, Edge, and Arc

1. Open your browser and navigate to `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `dist` directory

### Installing in Firefox

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click ***Load Temporary Add-on**
3. Navigate to the `dist_firefox` directory and select the `manifest.json` file
