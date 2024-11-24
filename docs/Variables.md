---
permalink: web-clipper/variables
---
[[Obsidian Web Clipper/Templates|Web Clipper templates]] can use variables to automatically pre-populate data from the page in a template. Variables can be used in the **note name**, **note location**, **properties**, and **note content**. Variables can also be modified using [[filters]].

Use the `...` icon in the [[Introduction to Obsidian Web Clipper|Web Clipper]] extension to access the current page variables for use in templates. There are four types of variables you can use:

- Preset variables
- Meta variables
- Selector variables
- Schema.org variables

## Preset variables

Preset variables are automatically generated based on the page content. These typically work for most websites.

The main content variable is `{{content}}`, which contains the article content, or the [[Highlight web pages|highlights]], or the selection if there is any selected text on the page. Note that `{{content}}` attempts to extract the main content of the page, which may not always be what you want. In that case, you can use other preset variables or selector variables to extract the content you need.

| Variable          | Description                                                                            |
| ----------------- | -------------------------------------------------------------------------------------- |
| `{{author}}`      | Author of the page                                                                     |
| `{{content}}`     | Article content, [[Highlight web pages\|highlights]], or selection, in Markdown format |
| `{{contentHtml}}` | Article content, [[Highlight web pages\|highlights]], or selection, in HTML format     |
| `{{date}}`        | Current date, can be formatted using the `date` filter                                 |
| `{{description}}` | Description or excerpt                                                                 |
| `{{domain}}`      | Domain                                                                                 |
| `{{favicon}}`     | Favicon URL                                                                            |
| `{{fullHtml}}`    | Unprocessed HTML for the full page content                                             |
| `{{highlights}}`  | [[Highlight web pages\|Highlights]] with text and timestamps                           |
| `{{image}}`       | Social share image URL                                                                 |
| `{{published}}`   | Published date, can be formatted using the `date` filter                               |
| `{{site}}`        | Site name or publisher                                                                 |
| `{{title}}`       | Title of the page                                                                      |
| `{{time}}`        | Current date and time                                                                  |
| `{{url}}`         | Current URL                                                                            |

## Meta variables

Meta variables allow you to extract data from [meta elements](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta) in the page, including [Open Graph](https://ogp.me/) data used to populate social share previews.

- `{{meta:name}}` returns the content of the meta name tag with the given name, e.g. `{{meta:name:description}}` for the `description` meta tag.
- `{{meta:property}}` returns the content of the meta property tag with the given property, e.g. `{{meta:property:og:title}}` for the `og:title` meta tag.

## Selector variables

Selector variables allow you to extract text content from elements on the page using [CSS selectors](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_selectors/Selectors_and_combinators).

The syntax is `{{selector:cssSelector?attribute}}`, where `?attribute` is optional. If no attribute is specified, the text content of the element is returned. You can also use `{{selectorHtml:cssSelector}}` to get the HTML content of the element. Selector variables tend to work best on a specific website or set of websites that have consistent HTML structure.

- `{{selector:h1}}` returns text content of the first `h1` element on the page.
- `{{selector:.author}}` returns text content of the first `.author` element on the page.
- `{{selector:img.hero?src}}` returns the `src` attribute of the first image with class `hero`.
- `{{selector:a.main-link?href}}` returns the `href` attribute of the first anchor tag with class `main-link`.
- `{{selectorHtml:body|markdown}}` returns the entire HTML of the `body` element, converted to Markdown using the `markdown` [[Filters#HTML processing|filter]].
- Nested CSS selectors and combinators are supported if you need more specificity.
- If multiple elements match the selector, an array is returned, which you can process with [[Filters#Arrays and objects|array and object filters]] like `join` or `map`.

## Schema.org variables

Schema variables allow you to extract data from [schema.org](https://schema.org/) JSON-LD on the page. Schema.org data can also be used to automatically [[Obsidian Web Clipper/Templates#Schema.org matching|trigger a template]].

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

