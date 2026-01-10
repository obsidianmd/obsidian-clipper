---
permalink: web-clipper/templates
description: Learn to create templates that capture and organize web page metadata automatically with Web Clipper.
---
[[Introduction to Obsidian Web Clipper|Web Clipper]] allows you to create templates that automatically capture and organize metadata from web pages. Example templates are available in the [clipper-templates repo](https://github.com/kepano/clipper-templates). 

## Create or edit a template

To **create** a template go to Web Clipper settings and click the **New template** button in the sidebar. You can also **duplicate** a template in the **More** actions menu in the top right corner.

To **edit** a template choose a template from the sidebar. Your changes will be saved automatically.

Templates make use of [[Variables]] and [[Filters]], which allow you to tailor how content will be saved.

## Import and export Web Clipper templates

To import a template:

1. Open the extension and click the **[[Settings]]** cog icon.
2. Go to any template in the list.
3. Click **Import** in the top right or drag and drop your `.json` template file(s) anywhere in the template area.

To export a template click **Export** in the top right. This will download the template `.json` file. You can also copy the template data to your clipboard via the **More** menu.

## Template settings

### Behavior

Define how content from Web Clipper will be added to Obsidian:

- **Create a new note**
- **Add to an existing note**, at the top or bottom
- **Add to daily note**, at the top or bottom (requires the [[daily notes]] plugin to be active)

### Automatically trigger a template

Template triggers allow you to automatically select a template based on the current page URL or [schema.org](https://schema.org/) data. You can define multiple rules for each template, separated by a new line.

The first match in your template list determines which template is used. You can drag templates up and down in Web Clipper settings to change the order in which templates are matched.

#### Simple URL matching

Simple matching triggers a template if the current page URL *starts with* the given pattern. For example:

- `https://obsidian.md` will match any URL that starts with this text.

#### Regular expression matching

You can trigger templates based on more complex URL patterns using regular expressions. Enclose your regex pattern in forward slashes (`/`). Remember to escape special characters in regex patterns (like `.` and `/`) with a backslash (`\`). For example:

- `/^https:\/\/www\.imdb\.com\/title\/tt\d+\/reference\/?$/` will match any IMDB reference page.

#### Schema.org matching

You can trigger templates based on [schema.org](https://schema.org/) data present on the page. Use the `schema:` prefix followed by the schema key you want to match. You can optionally specify an expected value. For example:

- `schema:@Recipe` will match pages where the schema type is "Recipe".
- `schema:@Recipe.name` will match pages where `@Recipe.name` is present.
- `schema:@Recipe.name=Cookie` will match pages where `@Recipe.name` is "Cookie".

Schema.org values can also be used to [[Variables#Schema.org variables|pre-populate data in templates]].

### Interpreter context

When [[Interpret web pages|Interpreter]] is enabled, you can use [[Variables#Prompt variables|prompt variables]] to extract page content with natural language. For each template you can define the [[Interpret web pages#Context|context]] that Interpreter has access too.

## Template logic

Web Clipper supports template logic for conditionals, loops, and variable assignment. This syntax is inspired by [Twig](https://twig.symfony.com/) and [Liquid](https://shopify.github.io/liquid/) templating languages.

### Conditionals

Use `{% if %}` to conditionally include content based on variables or expressions.

```
{% if author %}
Author: {{author}}
{% endif %}
```

#### Else and elseif

Use `{% else %}` to provide fallback content, and `{% elseif %}` to chain multiple conditions:

```
{% if status == "published" %}
Live article
{% elseif status == "draft" %}
Draft article
{% else %}
Unknown status
{% endif %}
```

#### Comparison operators

The following comparison operators are supported:

| Operator | Description |
|----------|-------------|
| `==` | Equal to |
| `!=` | Not equal to |
| `>` | Greater than |
| `<` | Less than |
| `>=` | Greater than or equal to |
| `<=` | Less than or equal to |
| `contains` | Check if string contains substring, or array contains value |

Examples:
- `{% if title == "Home" %}` — string equality
- `{% if price >= 100 %}` — numeric comparison
- `{% if title contains "Review" %}` — substring check
- `{% if tags contains "important" %}` — array membership

#### Logical operators

Combine conditions using logical operators:

| Operator | Alternative | Description |
|----------|-------------|-------------|
| `and` | `&&` | Both conditions must be true |
| `or` | `\|\|` | At least one condition must be true |
| `not` | `!` | Negates a condition |

Examples:
- `{% if author and published %}` — both must exist
- `{% if draft or archived %}` — either condition
- `{% if not hidden %}` — negation
- `{% if (premium or featured) and published %}` — grouped conditions

#### Truthiness

When a variable is used without a comparison operator, it's evaluated for "truthiness":

- `false`, `null`, `undefined`, empty string `""`, and `0` are considered **falsy**
- Empty arrays `[]` are considered **falsy**
- Everything else is **truthy**

```
{% if content %}
Has content
{% endif %}
```

### Variable assignment

Use `{% set %}` to create or modify variables within your template:

```
{% set slug = title|lower|replace:" ":"-" %}
File: {{slug}}.md
```

Variables can be set to:
- Other variables: `{% set name = author %}`
- Literals: `{% set count = 5 %}` or `{% set label = "Draft" %}`
- Expressions with filters: `{% set excerpt = content|truncate:100 %}`
- Selector results: `{% set comments = selector:.comment %}`

Variables set with `{% set %}` can be used in subsequent template logic and in `{{variable}}` output.

### Loops

Use `{% for %}` to iterate over arrays:

```
{% for item in schema:author %}
- {{item.name}}
{% endfor %}
```

#### Loop sources

You can loop over:
- Schema arrays: `{% for item in schema:author %}`
- Selector results: `{% for comment in selector:.comment %}`
- Variables set earlier: `{% set items = selector:.item %}{% for item in items %}`

#### Loop variables

Inside a loop, you have access to a `loop` object with the following properties:

| Variable | Description |
|----------|-------------|
| `loop.index` | Current iteration (1-indexed) |
| `loop.index0` | Current iteration (0-indexed) |
| `loop.first` | `true` if first iteration |
| `loop.last` | `true` if last iteration |
| `loop.length` | Total number of items |

```
{% for tag in tags %}
{{loop.index}}. {{tag}}
{% if loop.last %} (end of list){% endif %}
{% endfor %}
```

For backwards compatibility, you can also use `item_index` (where `item` is your iterator variable name) to get the 0-indexed position:

```
{% for tag in tags %}
{{tag_index}}. {{tag}}
{% endfor %}
```

#### Accessing array items by index

Use bracket notation to access array elements by index:

```
{{items[0]}}
{{items[loop.index0]}}
```

This is useful when you need to access items from multiple arrays in parallel:

```
{% set transcripts = selector:.transcript-text %}
{% set timestamps = selector:.timestamp %}

{% for line in transcripts %}
{{timestamps[loop.index0]}} - {{line}}
{% endfor %}
```

Bracket notation also works with object properties:

```
{{user["name"]}}
{{data["my-key"]}}
```

#### Nested loops

Loops can be nested for complex data structures:

```
{% for section in sections %}
## {{section.title}}
{% for item in section.items %}
- {{item}}
{% endfor %}
{% endfor %}
```

### Combining logic

Conditionals and loops can be combined:

```
{% for item in items %}
{% if item.active %}
- {{item.name}}
{% endif %}
{% endfor %}
```

### Whitespace control

By default, template tags produce line breaks in the output. Use the `-` modifier to strip whitespace:

| Syntax | Effect |
|--------|--------|
| `{%- ... %}` | Strip whitespace and newline **before** the tag |
| `{% ... -%}` | Strip whitespace and newline **after** the tag |
| `{%- ... -%}` | Strip both |

This is useful for inline output or avoiding extra blank lines:

```
{%- set name = author -%}
{%- if name -%}
By {{name}}
{%- endif -%}
```

Without the `-` modifiers, this would produce extra blank lines. With them, the output is clean:

```
By Author Name
```

Another example for inline conditions:

```
Status: {% if published -%}Live{%- else -%}Draft{%- endif %}
```

Output: `Status: Live`
