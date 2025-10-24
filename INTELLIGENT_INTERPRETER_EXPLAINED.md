# Intelligent Interpreter: Ephemeral Template Generation

**Feature Type:** AI-Powered Dynamic Template Generation
**Status:** Research/Planning Phase
**Date:** 2025-10-24

---

## Executive Summary

The Intelligent Interpreter feature enables the LLM to **generate custom Web Clipper templates on-the-fly** for each webpage, optimized for that page's unique structure. Unlike template selection systems, this feature creates **ephemeral, single-use templates** that are discarded after clipping.

**Key Distinction:** This is NOT about selecting from existing templates. This is about **generating new templates from scratch** for each clip.

---

## The Complete Flow

### Step-by-Step Process

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER INITIATES CLIP                                      │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. EXTRACT RAW PAGE DATA                                    │
│    • Full HTML structure                                     │
│    • Schema.org JSON-LD data                                │
│    • Page metadata (title, author, description)             │
│    • DOM outline and semantic structure                     │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. SEND TO INTERPRETER (LLM)                                │
│    Request: "Analyze this HTML and generate an optimal      │
│             Web Clipper template for extracting content"    │
│                                                              │
│    Input Context:                                            │
│    • Raw HTML or compressed semantic outline                │
│    • Available variable types (selector, schema, simple)    │
│    • Available filters (remove_html, upper, date, etc.)     │
│    • Web Clipper template syntax reference                  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. LLM GENERATES TEMPLATE                                   │
│    Output: Complete Template Object                         │
│    {                                                         │
│      noteContentFormat: "# {{title}}\n\n{{selectorHtml:...}}"│
│      properties: [                                           │
│        { name: "author", value: "{{schema:@Article.author}}" }│
│      ],                                                      │
│      noteNameFormat: "{{title}}",                            │
│      path: "Clippings",                                      │
│      behavior: "create"                                      │
│    }                                                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. CLIPPER RE-CLIPS WITH GENERATED TEMPLATE                 │
│    • Apply generated template to page                        │
│    • Resolve all {{selector:...}} variables via DOM queries │
│    • Extract {{schema:...}} variables from JSON-LD          │
│    • Apply filters to format content                         │
│    • Compile final note content                              │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. USER REVIEWS EXTRACTED CONTENT                           │
│    • Preview shows formatted note with extracted content    │
│    • User can see what was extracted and how it's formatted │
│    • User can approve or regenerate                          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. SAVE TO OBSIDIAN                                         │
│    • Note saved to vault                                     │
│    • Generated template is DISCARDED (not saved)            │
│    • No persistent template created                          │
└─────────────────────────────────────────────────────────────┘
```

---

## How It Differs From Existing Systems

### Current Interpreter (src/utils/interpreter.ts)
**What it does:** Fills `{{prompt:...}}` variables within existing templates
**Example:** Template has `{{prompt:"summarize"}}` → LLM provides summary → inserted into template
**Template source:** User-created, persistent templates

### Intelligent Interpreter (This Feature)
**What it does:** Generates entire template structure from scratch
**Example:** Analyzes page → creates complete template with selectors, properties, formatting
**Template source:** AI-generated, ephemeral (one-time use)

### Comparison Table

| Aspect | Current Interpreter | Intelligent Interpreter |
|--------|-------------------|------------------------|
| Template source | User-created | AI-generated |
| Persistence | Saved in library | Discarded after use |
| Scope | Fills prompt variables only | Generates complete template |
| Input | User prompts in template | Full page HTML |
| Output | Text responses | Template structure (JSON) |
| Use case | Dynamic content within known structure | Unknown/new page structures |

---

## Web Clipper Template Syntax Reference

The LLM must generate templates using these components:

### 1. Template Structure
```typescript
interface Template {
  noteContentFormat: string;   // Main template body with variables
  properties: Property[];       // Frontmatter metadata
  noteNameFormat: string;       // Note filename pattern
  path: string;                 // Vault folder path
  behavior: 'create' | 'append-specific' | 'prepend-specific' | 'overwrite';
}
```

### 2. Variable Types

#### A. Simple Variables
```
{{title}}           → Page title
{{url}}             → Current URL
{{author}}          → Page author (meta tag)
{{description}}     → Meta description
{{published}}       → Publication date
{{image}}           → Featured image URL
{{favicon}}         → Site favicon
```

#### B. Selector Variables (DOM Extraction)
```
{{selector:#main}}                    → Extract from CSS selector
{{selectorHtml:.article-content}}     → Same as selector
{{selector:.post-body|remove_html}}   → With filter applied
```
**Key capability:** LLM can generate optimal CSS selectors for page structure

#### C. Schema.org Variables (JSON-LD)
```
{{schema:@Article.headline}}          → Extract from structured data
{{schema:@Recipe.ingredients}}        → Recipe ingredients array
{{schema:@Product.price}}             → Product price
```
**Key capability:** LLM can identify available schema.org types and properties

#### D. Filters
```
{{title|upper}}                       → UPPERCASE
{{content|remove_html}}               → Strip HTML tags
{{published|date:YYYY-MM-DD}}         → Format date
{{text|replace:"foo":"bar"}}          → Replace text
```

### 3. Logic Constructs
```
{% if author %}
Author: {{author}}
{% endif %}

{% for tag in tags %}
- {{tag}}
{% endfor %}
```

---

## Example: Generated Template for Research Article

### Input: Academic Article Page
```html
<html>
  <head>
    <title>Neural Networks for Time Series Prediction: A Review</title>
    <meta name="author" content="Dr. Jane Smith">
    <script type="application/ld+json">
    {
      "@type": "ScholarlyArticle",
      "headline": "Neural Networks for Time Series...",
      "author": [{"name": "Jane Smith"}, {"name": "John Doe"}]
    }
    </script>
  </head>
  <body>
    <article>
      <section class="abstract">
        <h2>Abstract</h2>
        <p>This paper reviews...</p>
      </section>
      <section id="introduction">...</section>
      <section id="methodology">...</section>
      <section id="results">...</section>
    </article>
  </body>
</html>
```

### LLM-Generated Template (Ephemeral)
```json
{
  "noteContentFormat": "# {{schema:@ScholarlyArticle.headline}}\n\n## Metadata\n- **Authors**: {{schema:@ScholarlyArticle.author}}\n- **Source**: {{url}}\n- **Clipped**: {{date:YYYY-MM-DD}}\n\n## Abstract\n{{selectorHtml:.abstract|remove_html}}\n\n## Introduction\n{{selectorHtml:#introduction|remove_html}}\n\n## Methodology\n{{selectorHtml:#methodology|remove_html}}\n\n## Results\n{{selectorHtml:#results|remove_html}}",

  "properties": [
    {
      "name": "type",
      "value": "academic-article"
    },
    {
      "name": "authors",
      "value": "{{schema:@ScholarlyArticle.author}}"
    },
    {
      "name": "source-url",
      "value": "{{url}}"
    },
    {
      "name": "clipped-date",
      "value": "{{date:YYYY-MM-DD}}"
    }
  ],

  "noteNameFormat": "{{schema:@ScholarlyArticle.headline}}",
  "path": "Research/Articles",
  "behavior": "create"
}
```

### Resulting Obsidian Note
```markdown
---
type: academic-article
authors: Jane Smith, John Doe
source-url: https://example.com/article
clipped-date: 2025-10-24
---

# Neural Networks for Time Series Prediction: A Review

## Metadata
- **Authors**: Jane Smith, John Doe
- **Source**: https://example.com/article
- **Clipped**: 2025-10-24

## Abstract
This paper reviews recent advances in neural network architectures...

## Introduction
Time series prediction has been a fundamental problem...

## Methodology
We conducted a comprehensive literature review...

## Results
Our analysis reveals three key trends...
```

---

## Example: Generated Template for Recipe

### Input: Recipe Page
```html
<html>
  <script type="application/ld+json">
  {
    "@type": "Recipe",
    "name": "Chocolate Chip Cookies",
    "author": "Chef Maria",
    "recipeIngredient": ["2 cups flour", "1 cup sugar"],
    "recipeInstructions": [...]
  }
  </script>
  <body>
    <div class="recipe-content">
      <div class="ingredients">...</div>
      <div class="instructions">...</div>
      <div class="notes">...</div>
    </div>
  </body>
</html>
```

### LLM-Generated Template
```json
{
  "noteContentFormat": "# {{schema:@Recipe.name}}\n\n**Author**: {{schema:@Recipe.author}}\n**Source**: {{url}}\n\n## Ingredients\n{{schema:@Recipe.recipeIngredient}}\n\n## Instructions\n{{selectorHtml:.instructions|remove_html}}\n\n## Notes\n{{selectorHtml:.notes|remove_html}}",

  "properties": [
    {
      "name": "type",
      "value": "recipe"
    },
    {
      "name": "author",
      "value": "{{schema:@Recipe.author}}"
    }
  ],

  "noteNameFormat": "{{schema:@Recipe.name}}",
  "path": "Recipes",
  "behavior": "create"
}
```

---

## Technical Implementation Architecture

### New Module: `src/utils/interpreter-template-generation.ts`

```typescript
/**
 * Generate ephemeral template optimized for specific page
 */
async function generateTemplateForPage(
  pageData: ContentResponse,
  model: ModelConfig
): Promise<Template> {
  // 1. Prepare page context for LLM
  const context = preparePageContext(pageData);

  // 2. Create system prompt with template syntax reference
  const systemPrompt = buildTemplateGenerationPrompt();

  // 3. Send to LLM
  const response = await sendToLLM(systemPrompt, context, model);

  // 4. Parse JSON response into Template object
  const template = parseGeneratedTemplate(response);

  // 5. Validate template structure
  validateTemplate(template);

  return template;
}

/**
 * Prepare compressed page context (reduce token usage)
 */
function preparePageContext(pageData: ContentResponse): string {
  return JSON.stringify({
    title: pageData.title,
    url: pageData.url,
    schemaOrgData: pageData.schemaOrgData,
    domOutline: extractDOMOutline(pageData.fullHtml),  // Simplified structure
    availableSelectors: suggestKeySelectors(pageData.fullHtml),
    wordCount: pageData.content.split(' ').length
  });
}

/**
 * Extract semantic DOM outline (not full HTML)
 */
function extractDOMOutline(html: string): object {
  // Return simplified structure like:
  // { article: { sections: [".abstract", "#intro", "#methods"] } }
  // This reduces token usage significantly
}
```

### Integration Point: `src/core/popup.ts`

```typescript
async function refreshFields(tabId: number) {
  // 1. Extract page content (existing)
  const extractedData = await extractPageContent(tabId);

  // 2. Check if intelligent mode enabled
  if (generalSettings.intelligentTemplateGenerationEnabled) {

    // Show loading indicator
    showIntelligentGenerationUI("Analyzing page structure...");

    // 3. Generate ephemeral template
    const generatedTemplate = await generateTemplateForPage(
      extractedData,
      generalSettings.interpreterModel
    );

    // 4. Use generated template (don't save to library)
    currentTemplate = generatedTemplate;
    ephemeralTemplate = true;  // Flag to prevent saving

    // 5. Show what was generated (transparency)
    displayGeneratedTemplateInfo(generatedTemplate);

  } else {
    // Fall back to existing template selection
    const matchedTemplate = await findMatchingTemplate(url, schemaData);
    currentTemplate = matchedTemplate || templates[0];
  }

  // 6. Continue with normal flow (compile template, show preview)
  await initializeTemplateFields(currentTemplate, variables);
}

/**
 * Display info about generated template (transparency)
 */
function displayGeneratedTemplateInfo(template: Template) {
  const info = `
    AI Generated Template:
    - Extracting: ${detectSelectorCount(template)} page sections
    - Properties: ${template.properties.length} metadata fields
    - Using: ${detectSchemaTypes(template).join(', ')} structured data
  `;
  showInfoPanel(info);
}
```

### System Prompt Design

```typescript
const TEMPLATE_GENERATION_SYSTEM_PROMPT = `
You are an expert at analyzing web pages and generating Obsidian Web Clipper templates.

Your task: Analyze the provided page structure and generate an optimal extraction template.

Available variable types:
1. Simple: {{title}}, {{url}}, {{author}}, {{description}}, {{published}}, {{image}}
2. Selectors: {{selector:CSS_SELECTOR}}, {{selectorHtml:CSS_SELECTOR}}
3. Schema.org: {{schema:@Type.property}} (use JSON-LD data)
4. Filters: |remove_html, |upper, |lower, |date:FORMAT, |replace:"old":"new"

Template structure requirements:
- noteContentFormat: Main body with markdown formatting and variables
- properties: Array of metadata fields for frontmatter
- noteNameFormat: Filename pattern (usually {{title}} or schema headline)
- path: Folder path (infer from content type: "Articles", "Recipes", "Research", etc.)
- behavior: Usually "create"

Best practices:
1. Use {{schema:...}} when JSON-LD data is available (most reliable)
2. Use {{selector:...}} for page-specific content sections
3. Apply |remove_html filter to selector variables for clean text
4. Create semantic property names (publication-date, authors, source-url)
5. Structure noteContentFormat with clear markdown headings
6. Infer appropriate folder path based on content type

Return ONLY valid JSON matching the Template interface.
`;
```

### Example LLM Request/Response

**Request:**
```json
{
  "systemPrompt": "[TEMPLATE_GENERATION_SYSTEM_PROMPT]",
  "userMessage": {
    "page": {
      "title": "Neural Networks for Time Series",
      "url": "https://example.com/article",
      "schemaOrgData": {
        "@type": "ScholarlyArticle",
        "headline": "Neural Networks...",
        "author": [{"name": "Jane Smith"}]
      },
      "domOutline": {
        "article": {
          "sections": [".abstract", "#introduction", "#methodology", "#results"]
        }
      },
      "wordCount": 8500
    }
  }
}
```

**Response:**
```json
{
  "noteContentFormat": "# {{schema:@ScholarlyArticle.headline}}\n\n## Metadata\n- **Authors**: {{schema:@ScholarlyArticle.author}}\n- **Source**: {{url}}\n\n## Abstract\n{{selectorHtml:.abstract|remove_html}}\n\n## Content\n{{selectorHtml:article|remove_html}}",
  "properties": [
    {"name": "type", "value": "academic-article"},
    {"name": "authors", "value": "{{schema:@ScholarlyArticle.author}}"}
  ],
  "noteNameFormat": "{{schema:@ScholarlyArticle.headline}}",
  "path": "Research/Articles",
  "behavior": "create"
}
```

---

## Key Benefits

### 1. Zero Template Maintenance
Users don't need to create or maintain templates for every possible page type.

### 2. Optimal Extraction
Each template is custom-built for the specific page structure, ensuring best possible extraction.

### 3. Handles Novel Content
Works on any page structure, even ones never seen before.

### 4. No Library Clutter
Generated templates are ephemeral - no pollution of template library.

### 5. Adaptive to Page Changes
If a site redesigns, next clip generates new template automatically.

---

## Challenges & Solutions

### Challenge 1: LLM Must Understand Web Clipper Syntax

**Problem:** LLM needs to know exact syntax for variables, filters, logic

**Solution:**
- Include comprehensive syntax reference in system prompt
- Provide examples of valid templates
- Validate generated template structure before use
- Provide clear error messages if generation fails

### Challenge 2: Selector Reliability

**Problem:** Generated selectors like `{{selector:#main}}` might not exist on page

**Solution:**
- LLM generates selectors from actual DOM outline (not guessing)
- Validate selectors exist before applying template
- Fallback to simpler selectors if complex ones fail
- Provide selector suggestions from actual page analysis

### Challenge 3: Token Usage

**Problem:** Sending full HTML could exceed context limits

**Solution:**
- Send DOM outline instead of full HTML (structure only)
- Extract and send list of available selectors (pre-analyzed)
- Compress repeated structures
- Use smaller model for generation (doesn't need reasoning, just structure)

### Challenge 4: Response Latency

**Problem:** Generation could take 5-15 seconds

**Solution:**
- Show progress indicator ("Analyzing page structure...")
- Allow user to cancel and select manual template
- Cache generated templates per domain pattern (optional enhancement)
- Use streaming response to show progress

### Challenge 5: Quality Assurance

**Problem:** Generated template might miss important content

**Solution:**
- Show preview of extracted content before saving
- Allow regeneration with different model or parameters
- Provide manual override option
- Learn from user edits (future enhancement)

---

## Settings & Configuration

### New Settings Required

```typescript
interface Settings {
  // ... existing settings

  // Intelligent template generation
  intelligentTemplateGenerationEnabled: boolean;
  intelligentTemplateGenerationMode: 'always' | 'ask' | 'manual';
  templateGenerationModel?: string;  // Can use different model than prompt interpreter
  showGeneratedTemplateInfo: boolean;  // Display what was generated
  allowTemplateRegeneration: boolean;  // Let user request new generation
}
```

### Settings UI
```
┌────────────────────────────────────────┐
│ Intelligent Template Generation        │
├────────────────────────────────────────┤
│ [x] Enable AI template generation      │
│                                         │
│ Mode: [Always] [Ask first] [Manual]    │
│                                         │
│ Model: [GPT-4o-mini ▼]                 │
│                                         │
│ [x] Show generation details            │
│ [x] Allow regeneration                 │
│                                         │
│ Note: Generated templates are not      │
│ saved to your library. Each page gets  │
│ a custom template optimized for its    │
│ structure.                              │
└────────────────────────────────────────┘
```

---

## User Experience Flow

### Scenario: User clips research article

```
1. User clicks Web Clipper extension
   └─> "Opening clipper..."

2. Extension analyzes page
   └─> Badge appears: "🤖 Generating optimal template..."

3. LLM generates template (3-5 seconds)
   └─> Badge updates: "✓ Template optimized for academic article"

4. Preview shows extracted content
   ┌─────────────────────────────────────┐
   │ Preview:                             │
   │                                      │
   │ # Neural Networks for Time Series... │
   │                                      │
   │ ## Metadata                          │
   │ - Authors: Jane Smith, John Doe      │
   │ - Source: https://example.com        │
   │                                      │
   │ ## Abstract                          │
   │ This paper reviews...                │
   │                                      │
   │ [Extracted 4 sections automatically] │
   └─────────────────────────────────────┘

5. User reviews
   └─> Options: [Save to Obsidian] [Regenerate Template] [Edit]

6. User saves
   └─> Note saved, ephemeral template discarded
```

---

## Comparison to Research Documents

### Research Vision (INTELLIGENT_INTERPRETER_RESEARCH.md)
- **Goal:** Select best existing template from library
- **Approach:** Match page to user's templates
- **Output:** Template ID + confidence score
- **Persistence:** Uses existing templates

### Actual Feature (This Document)
- **Goal:** Generate optimal template from scratch
- **Approach:** Analyze page and create custom template
- **Output:** Complete Template object
- **Persistence:** Ephemeral, discarded after use

### Why The Difference?
The research explored template **selection** as a way to improve the existing workflow. This feature takes a different approach: eliminate template management entirely by generating optimal templates on-demand.

**Trade-offs:**

| Aspect | Template Selection | Template Generation |
|--------|-------------------|-------------------|
| User template library | Required | Not required |
| Token usage | Lower (~1500) | Higher (~3000-5000) |
| Latency | 2-3 seconds | 5-10 seconds |
| Customization | Limited to library | Unlimited |
| Maintenance | User creates templates | Zero maintenance |
| Learning curve | Must understand templates | Just clip |

---

## Implementation Roadmap

### Phase 1: Core Generation (Week 1-2)
- [ ] Create `interpreter-template-generation.ts` module
- [ ] Implement `generateTemplateForPage()` function
- [ ] Design system prompt with syntax reference
- [ ] Build DOM outline extraction (reduce tokens)
- [ ] Implement template validation

### Phase 2: Integration (Week 3-4)
- [ ] Integrate with `refreshFields()` in popup.ts
- [ ] Add ephemeral template flag (prevent saving)
- [ ] Implement progress indicators
- [ ] Add settings UI for feature toggle
- [ ] Create template info display

### Phase 3: Quality & UX (Week 5-6)
- [ ] Add template regeneration option
- [ ] Implement selector validation
- [ ] Optimize token usage (aggressive compression)
- [ ] Add error handling and fallbacks
- [ ] Create user documentation

### Phase 4: Advanced Features (Week 7-8)
- [ ] Optional: Cache templates by domain pattern
- [ ] Optional: Learn from user edits
- [ ] Optional: Allow saving generated templates to library
- [ ] Performance optimization
- [ ] A/B testing framework

---

## Success Metrics

### Quantitative
1. **Extraction Quality**: % of clips requiring no manual editing
   - Target: >80%

2. **User Adoption**: % of users enabling feature
   - Target: >60%

3. **Time to Clip**: Average time from open to save
   - Target: <15 seconds (including generation)

4. **Regeneration Rate**: % of clips triggering regeneration
   - Target: <10% (indicates good initial generation)

### Qualitative
5. **User Feedback**: Comments about extraction accuracy
6. **Support Tickets**: Reduction in "how do I clip X" questions
7. **Feature Requests**: Requests for manual template creation should decrease

---

## Related Files

### Existing Codebase
- `src/utils/interpreter.ts` - Current prompt variable interpreter (different feature)
- `src/utils/template-compiler.ts` - Template variable resolution (will be used by generated templates)
- `src/utils/content-extractor.ts` - Page content extraction
- `src/types/types.ts` - Template interface definition
- `src/core/popup.ts:642` - `refreshFields()` integration point

### Research Documents
- `INTELLIGENT_INTERPRETER_RESEARCH.md` - Template **selection** research (different approach)
- `INTELLIGENT_INTERPRETER_FLOWS.md` - Flow diagrams for selection approach

### New Files (To Be Created)
- `src/utils/interpreter-template-generation.ts` - Core generation logic
- `src/utils/dom-outline-extractor.ts` - Compress HTML to outline
- `src/ui/template-generation-ui.ts` - UI components for feature

---

## Conclusion

The Intelligent Interpreter feature represents a paradigm shift from **user-managed templates** to **AI-generated ephemeral templates**. Instead of maintaining a library of templates for different page types, users simply clip any page and the system generates an optimal extraction template on-the-fly.

**Key Innovation:** Treating templates as **disposable extraction code** rather than persistent configurations.

**Expected Impact:**
- Eliminates template creation/maintenance burden
- Enables clipping any page type without setup
- Optimizes extraction for each unique page structure
- Reduces user decision-making to zero (just click clip)

This feature transforms Web Clipper from a template-based tool into an intelligent extraction system that adapts to any content.
