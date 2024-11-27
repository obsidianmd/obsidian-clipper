---
permalink: web-clipper/interpreter
aliases:
  - Interpreter
---
Interpreter is a [[Introduction to Obsidian Web Clipper|Web Clipper]] feature that lets you interact with web pages using natural language. Interpreter helps you capture and modify data that you want to save to Obsidian. For example:

- Extract specific text fragments.
- Summarize or explain information.
- Convert text from one format to another.
- Translate text to a different language.

Interpreter leverages language models to process information on a web page, and return results as [[Variables]] that you can use within your [[Obsidian Web Clipper/Templates|Web Clipper Templates]].

## Examples of prompts

Prompts use the [[Variables|variable]] syntax `{{"your prompt"}}`. You can use this syntax with any natural language query, e.g.

- `{{"a summary of the page"}}` to extract a summary of the page.
- `{{"a three bullet point summary, translated to French"}}` to extract bullet points about the page, and translate them to French.

The output of your prompts can be further manipulated using [[Filters]]. Filters are processed after the prompt response is received from the model. For example: `{{"a summary of the page"|blockquote}}` will turn the response into a blockquote.

## Get started

Interpreter works with almost any language model, including models that run privately on your device. You can also use an API key from Anthropic or OpenAI to access built-in models from those providers.

1. Go to the **Interpreter** section in Web Clipper settings.
2. Toggle on **Enable Interpreter**.
3. Configure your models, see [[Interpret web pages#Models|models]] section below.
4. Add [[Variables|prompt variables]] to your [[Obsidian Web Clipper/Templates|templates]].
5. If your template includes prompt variables, the Interpreter section will be visible when you [[Clip web pages|clip a page]]. Click **interpret** to process the prompt variables.

When you click the **interpret** button, Interpreter will send the page data to your selected model, along with any prompts in your template. The model will evaluate those prompts against the page data and update any prompt variables with the new data. This process can take anywhere from milliseconds to 30 seconds or more, depending on your model provider and the amount of data you are processing.

## Context

Interpreter returns results faster if the page content is small. The term *context* refers to the page data that Interpreter uses. The smaller the context, the faster Interpreter runs. 

By default, Interpreter uses the entire page content as its context, however this can make prompts slower and more expensive than necessary.

You can override the default context in Interpreter **Advanced settings** and define context per [[Obsidian Web Clipper/Templates|template]].

To define a more targeted context use [[Variables#Selector variables|selector variables]] (or other variable types) to interpret a section of the page. For example, you could use the following selector variable in your template's Interpreter context:

```
{{selectorHtml:#main}}
```

 This would only run Interpreter on the `#main` element of a web page, if it exists. [[Filters#HTML processing|HTML processing filters]] like `remove_html`, `strip_tags` and `strip_attr` can be useful to further reduce the context length and speed up processing.

## Models

> [!warning] Privacy
> By using a third-party model provider you agree to their terms and privacy policy. Interpreter requests are sent directly to the provider you choose. Obsidian does not gather or store any data about your requests.

### Preset models

Interpreter includes several preset models available from Anthropic and OpenAI. To use these models you need an API key, which you can get by logging into your account:

- [Anthropic API key](https://console.anthropic.com/login?selectAccount=true&returnTo=%2Fsettings%2Fkeys%3F)
- [OpenAI API key](https://platform.openai.com/api-keys)

### Custom models

To add a custom model go to Web Clipper **Settings** → **Interpreter** → **Add model**, then fill in the model configuration fields.

See examples of configurations for OpenRouter and Ollama below.

#### OpenRouter

[OpenRouter](https://openrouter.ai/) allows you to connect to many different models and providers.

Once you have created an OpenRouter account, you will need [an API key](https://openrouter.ai/settings/keys). Then choose a model from the [model list](https://openrouter.ai/models).

In this example we use [Gemini Flash 1.5](https://openrouter.ai/google/gemini-flash-1.5). Enter the following values in Web Clipper **Add model** settings.

| Field    | Value                                           |
| -------- | ----------------------------------------------- |
| Name     | Gemini Flash 1.5                                |
| Base URL | `https://openrouter.ai/api/v1/chat/completions` |
| Model ID | `google/gemini-flash-1.5-8b`                    |
| Provider | OpenRouter                                      |
| API key  | *(your OpenRouter API key)*                     |

#### Ollama

[Ollama](https://ollama.com/) allows you to run language models locally and privately on your device. 

Once you have downloaded and installed Ollama, choose a model from the [model list](https://ollama.com/search). In this example we use [Llama 3.2](https://ollama.com/library/llama3.2). Enter the following values in Web Clipper **Add model** settings.

| Field    | Value                             |
| -------- | --------------------------------- |
| Name     | Llama 3.2                         |
| Base URL | `http://127.0.0.1:11434/api/chat` |
| Model ID | `llama3.2`                        |
| Provider | Ollama                            |
| API key  | ollama                            |
**Start the Ollama server**

To allow a browser extension to interact with Ollama you must give it explicit instruction when running the server, or else you will see a `403` error. 

Close the Ollama app, and run the following command in your terminal. The `chrome-extension` protocol should be changed to your browser's extension protocol if you don't use Chrome.

```
OLLAMA_ORIGINS=chrome-extension://* ollama serve
```

Then run your model with Ollama the normal way, e.g.

```
ollama run llama3.2
```

