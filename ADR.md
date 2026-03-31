# What name?

`promptrank1` clearly describes what the user wants: rank on number 1 for different prompts for their website. the dot com was available

# APIs or browser automation for different LLM apps?

different sources say that the actual apps often provide different search results than over the api, but this is a technical detail, and not worth the effort in this mini-version. the goal is to provide some full-fledged SaaS tool that could make money on its own, not having better or equal results to promptwatch.

# Which apis?

**chatgpt, claude, gemini, xai, and perplexity** have search built-in into their api. this is initially the best bet because this is the majority of usage of popular llm apps. furthermore we have the choice to use openrouter, which [is able](https://openrouter.ai/docs/guides/features/plugins/web-search) to use the native built-in web search within these mentioned apis. this simplifies implementation as we won't need an api key and balance for every provider, and we don't need to worry about the difference in implementation details.
