// Curated from the committed 2026-07-16 portfolio benchmark. This fixture is
// intentionally self-contained: sample playback must never require an API key,
// make a network request, or expose provider response identifiers.
export const SAMPLE_RUN = {
  recorded_at: "2026-07-16T17:32:24.415Z",
  model: "google/gemini-2.5-flash",
  summary: {
    question_count: 15,
    average_retrieved_count: 4,
    citation_pass_rate: 1,
    expected_source_pass_rate: 1,
    average_rag_latency_ms: 4993,
    total_cost_usd: 0.048606,
  },
  steps: [
    { id: "prompt", label: "Prompt" },
    { id: "standard", label: "No RAG" },
    { id: "retrieve", label: "Retrieve" },
    { id: "rag", label: "RAG answer" },
    { id: "checks", label: "Checks" },
  ],
  case: {
    id: "q10",
    category: "model-components",
    question: "How does dropout regularize a neural network?",
    standard: {
      reply: "What exactly are you trying to understand about dropout and regularization? Are you trying to debug a model, optimize its performance, or simply understand the theoretical mechanism better? Is there a specific problem you're encountering with your neural network that prompts this question?",
      usage: {
        prompt_tokens: 1233,
        completion_tokens: 50,
        total_tokens: 1283,
      },
      latency_ms: 6863,
    },
    rag: {
      reply: `Dropout regularizes a neural network by preventing complex co-adaptations between neurons during training [2].

1. **Random deactivation:** during training, a dropout layer independently sets a fraction of input activations to zero with probability \`p\` [2].
2. **Rescaling:** the remaining activations are scaled by \`1/(1-p)\` so their expected value stays unchanged [2].
3. **More robust features:** because neighboring activations may disappear on the next step, the network cannot rely on fragile group representations. The injected noise makes training more robust and reduces overfitting [2].
4. **Ensemble effect:** each iteration trains a different “thinned” network. At inference, dropout is switched off and all activations are retained [1, 2].

For images and other 2D tensors, nearby values are strongly correlated, so implementations often drop entire channels instead of individual activations [1, 4].`,
      usage: {
        prompt_tokens: 2042,
        completion_tokens: 477,
        total_tokens: 2519,
      },
      latency_ms: 3823,
      sources: [
        {
          citation: "[1] lbdl, p. 78",
          similarity: 0.900840526769144,
          source_path: "lbdl.pdf",
          excerpt: "During training, dropout sets activations at random to zero with probability p and applies a multiplying factor to keep expected values unchanged. During testing, all activations remain unchanged. For 2D tensors it sets entire channels to zero because neighboring signals are strongly correlated.",
        },
        {
          citation: "[2] lbdl, p. 77",
          similarity: 0.8874674506505,
          source_path: "lbdl.pdf",
          excerpt: "A dropout layer has no trainable parameters, but one hyperparameter p. It favors meaningful individual activations and discourages unreliable group representations. It can also be seen as noise injection that makes training more robust.",
        },
        {
          citation: "[3] lbdl, p. 109",
          similarity: 0.884436971876816,
          source_path: "lbdl.pdf",
          excerpt: "The transformer feed-forward block combines dropout, fully connected layers, GELU, layer normalization, and a residual connection.",
        },
        {
          citation: "[4] lbdl, p. 79",
          similarity: 0.871921461350797,
          source_path: "lbdl.pdf",
          excerpt: "For 2D signals, redundancy can nullify standard unstructured dropout, so the usual 2D dropout layer removes entire channels instead of individual values.",
        },
      ],
    },
    metrics: {
      retrieved_count: 4,
      max_similarity: 0.900840526769144,
      citation_pass: true,
      expected_source_pass: true,
      expected_term_coverage: 0.5,
      standard_cost_usd: 0.0004949,
      rag_cost_usd: 0.0018051,
    },
  },
};

export function sampleRunContainsCredentials(sample = SAMPLE_RUN) {
  const serialized = JSON.stringify(sample);
  return /sk-or-|sb_(?:publishable|secret)_|openrouterApiKey|supabaseAnonKey/i.test(serialized);
}
