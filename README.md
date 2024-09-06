Work in progress. Turning the [Obsidian web clipper bookmarklet](https://stephango.com/obsidian-web-clipper) into a proper Chrome extension.

**Run the extension locally**

- `npm install`
- `npm run dev`
- Go to `chrome://extensions/`
- Click `Load unpacked` and select the `dist` folder

### Template variables

Template variables can be used to automatically pre-populate data from the page in a template. Variables can be used in the **note name**, **note location**, **properties**, and **note content**.

#### Page variables

These variables are automatically generated based on the page content.

| Variable          | Description                  |
| ----------------- | ---------------------------- |
| `{{title}}`       | Title of the page            |
| `{{author}}`      | Author of the page           |
| `{{description}}` | Description or excerpt       |
| `{{published}`    | Published date               |
| `{{image}}`       | Social share image URL       |
| `{{content}}`     | Article content or selection |
| `{{today}}`       | Today's date                 |
| `{{url}}`         | Current URL                  |
| `{{domain}}`      | Domain                       |

#### Selector variables

Selector variables allow you to extract data from the page. The syntax for selector variables is `{{selector:cssSelector:attribute}}`, where `:attribute` is optional. If no attribute is specified, the text content of the element is returned.

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
- `{{schema:arrayKey.[*].property}}` returns a specific property from all items in an array.

### Filters

- Filters can be added to variables with a pipe, e.g. `{{variable|filter}}`.
- Filters also work for variables that use the `selector` or `schema` prefix.
- Filters can be chained, e.g. `{{variable|filter1|filter2}}` and are applied in the order they are added.

#### Available filters

- `wikilink` adds double brackets around strings and array items.
- `list` converts an array to a bullet list.
- `kebab` converts text to `kebab-case`.
- `pascal` converts text to `PascalCase`.
- `camel` converts text to `camelCase`.
- `snake` converts text to `snake_case`.
- `slice` extracts a portion of a string or array.
	- For strings: `"hello"|slice:1,4` returns `"ell"`.
	- For arrays: `["a","b","c","d"]|slice:1,3` returns `["b","c"]`.
	- If only one parameter is provided, it slices from that index to the end: `"hello"|slice:2` returns `"llo"`.
	- Negative indices count from the end: `"hello"|slice:-3` returns `"llo"`.
    - The second parameter is exclusive: `"hello"|slice:1,4` includes characters at indices 1, 2, and 3.
	- Using a negative second parameter excludes elements from the end: `"hello"|slice:0,-2` returns `"hel"`.
