---
permalink: web-clipper/logic
description: Use conditionals, loops, and variable assignment in Web Clipper templates.
---
[[Introduction to Obsidian Web Clipper|Web Clipper]] supports template logic for conditionals, loops, and variable assignment. This syntax is inspired by [Twig](https://twig.symfony.com/) and [Liquid](https://shopify.github.io/liquid/) templating languages.

## Conditionals

Use `{% if %}` to conditionally include content based on variables or expressions.

```twig
{% if author %}
Author: {{author}}
{% endif %}
```

### Else and elseif

Use `{% else %}` to provide fallback content, and `{% elseif %}` to chain multiple conditions:

```twig
{% if status == "published" %}
Live article
{% elseif status == "draft" %}
Draft article
{% else %}
Unknown status
{% endif %}
```

### Comparison operators

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

### Logical operators

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

Each side of a logical operator must be a complete expression. For example, to check if a string contains one of several values:

```twig
{% if title contains "review" or title contains "opinion" or title contains "editorial" %}
```

### Truthiness

When a variable is used without a comparison operator, it's evaluated for "truthiness":

- `false`, `null`, `undefined`, empty string `""`, and `0` are considered **falsy**
- Empty arrays `[]` are considered **falsy**
- Everything else is **truthy**

```twig
{% if content %}
Has content
{% endif %}
```

## Variable assignment

Use `{% set %}` to create or modify variables within your template:

```twig
{% set slug = title|lower|replace:" ":"-" %}
File: {{slug}}.md
```

Variables can be set to:
- Other variables: `{% set name = author %}`
- Literals: `{% set count = 5 %}` or `{% set label = "Draft" %}`
- Expressions with filters: `{% set excerpt = content|truncate:100 %}`
- Selector results: `{% set comments = selector:.comment %}`

Variables set with `{% set %}` can be used in subsequent template logic and in `{{variable}}` output.

## Fallback values

Use the `??` operator to provide fallback values when a variable is empty or undefined:

```twig
{{title ?? "Untitled"}}
```

If `title` is empty, undefined, or falsy, the fallback value `"Untitled"` will be used instead.

This is a shorthand for the equivalent `if` statement:

```
{% if title %}{{title}}{% else %}Untitled{% endif %}
```

### Chaining fallbacks

You can chain multiple fallbacks:

```twig
{{title ?? headline ?? "No title"}}
```

This will use `title` if available, otherwise `headline`, otherwise the string `"No title"`.

### With filters

Filters bind more tightly than `??`, so filters are applied before the fallback check:

```twig
{{title|upper ?? "UNTITLED"}}
```

This applies `upper` to `title` first, then falls back to `"UNTITLED"` if the result is empty. To apply filters to the fallback value, use parentheses or separate expressions:

```
{{title ?? "Untitled"|lower}}
```

This will use `title` if available, otherwise apply `lower` to the fallback, resulting in `"untitled"`.

## Loops

Use `{% for %}` to iterate over arrays:

```twig
{% for item in schema:author %}
- {{item.name}}
{% endfor %}
```

### Loop sources

You can loop over:
- Schema arrays: `{% for item in schema:author %}`
- Selector results: `{% for comment in selector:.comment %}`
- Variables set earlier: `{% set items = selector:.item %}{% for item in items %}`

### Loop variables

Inside a loop, you have access to a `loop` object with the following properties:

| Variable | Description |
|----------|-------------|
| `loop.index` | Current iteration (1-indexed) |
| `loop.index0` | Current iteration (0-indexed) |
| `loop.first` | `true` if first iteration |
| `loop.last` | `true` if last iteration |
| `loop.length` | Total number of items |

```twig
{% for tag in tags %}
{{loop.index}}. {{tag}}
{% if loop.last %} (end of list){% endif %}
{% endfor %}
```

For backwards compatibility, you can also use `item_index` (where `item` is your iterator variable name) to get the 0-indexed position:

```twig
{% for tag in tags %}
{{tag_index}}. {{tag}}
{% endfor %}
```

### Accessing array items by index

Use bracket notation to access array elements by index:

```twig
{{items[0]}}
{{items[loop.index0]}}
```

This is useful when you need to access items from multiple arrays in parallel:

```twig
{% set transcripts = selector:.transcript-text %}
{% set timestamps = selector:.timestamp %}

{% for line in transcripts %}
{{timestamps[loop.index0]}} - {{line}}
{% endfor %}
```

Bracket notation also works with object properties:

```twig
{{user["name"]}}
{{data["my-key"]}}
```

### Nested loops

Loops can be nested for complex data structures:

```twig
{% for section in sections %}
## {{section.title}}
{% for item in section.items %}
- {{item}}
{% endfor %}
{% endfor %}
```

## Combining logic

Conditionals and loops can be combined:

```twig
{% for item in items %}
{% if item.active %}
- {{item.name}}
{% endif %}
{% endfor %}
```

## Evaluation order

Template logic is processed in the following order:

1. **Template logic** — `{% if %}`, `{% for %}`, `{% set %}`, and `{{variables}}` are evaluated first
2. **Prompt variables** — [[Variables#Prompt variables|Prompt variables]] like `{{"summarize this"|prompt}}` are sent to the Interpreter after template logic is complete

This means you can use template logic to construct prompts dynamically, but prompt results are not available for use in conditionals or loops.
