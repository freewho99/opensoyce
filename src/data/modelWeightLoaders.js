/**
 * Model-weight loader posture v0.
 *
 * Background: AI projects load model weights via Hugging Face's
 * `from_pretrained()` and PyTorch's `torch.load()`, which historically
 * default to pickle format. Pickle is a code-execution format — loading
 * untrusted pickle weights can run arbitrary code at load time. The
 * safer alternative is `safetensors` (binary, no code execution) or
 * `torch.load(..., weights_only=True)` for PyTorch.
 *
 * OpenSoyce does NOT scan actual model files in v0. The chip's job is
 * a security-hygiene reminder: when an inventory contains a known
 * model-loading package, surface a posture recommendation. It is NOT
 * an RCE detector — pickle opcode analysis is a separate v1+ scanner
 * with different inputs, tools, and output shape.
 *
 * The chip is purely informational:
 *  - no score change
 *  - no Risk Profile contribution
 *  - no verdict band-cap
 *
 * Mirrors the informational pattern of cross-ecosystem-bridges.
 *
 * Three risk tiers:
 *  - 'load_pickle'  — chip fires recommending safetensors. AMBER.
 *  - 'torch_load'   — chip fires recommending safetensors OR
 *                     weights_only=True. AMBER.
 *  - 'safe'         — chip notes the package is the safer choice.
 *                     GREEN affirmation copy.
 *
 * @typedef {Object} ModelWeightLoaderEntry
 * @property {string} name
 * @property {'npm'|'PyPI'} ecosystem
 * @property {'load_pickle'|'torch_load'|'safe'} risk
 * @property {string|null} safer  - null when the package IS the safer choice
 * @property {string} reason
 */

/** @type {ModelWeightLoaderEntry[]} */
export const MODEL_WEIGHT_LOADERS = [
  // Python (PyPI) -----------------------------------------------------------
  {
    name: 'huggingface_hub',
    ecosystem: 'PyPI',
    risk: 'load_pickle',
    safer: 'safetensors',
    reason:
      'huggingface_hub.from_pretrained() loads pickle-format weights by default; use safetensors format when available',
  },
  {
    name: 'transformers',
    ecosystem: 'PyPI',
    risk: 'load_pickle',
    safer: 'safetensors',
    reason:
      'transformers.from_pretrained() resolves to pickle weights when safetensors is absent; specify use_safetensors=True or ensure model_index.json declares safetensors',
  },
  {
    name: 'diffusers',
    ecosystem: 'PyPI',
    risk: 'load_pickle',
    safer: 'safetensors',
    reason:
      'diffusers loads pickle-format model weights by default for many pipelines',
  },
  {
    name: 'torch',
    ecosystem: 'PyPI',
    risk: 'torch_load',
    safer: 'safetensors',
    reason:
      'torch.load() uses pickle and can execute arbitrary code on untrusted .pt/.bin files; use weights_only=True or safetensors',
  },
  {
    name: 'tensorflow',
    ecosystem: 'PyPI',
    risk: 'load_pickle',
    safer: 'safetensors',
    reason:
      'Older Keras .h5 / pickle-based checkpoints execute code on load; prefer SavedModel format or safetensors',
  },
  {
    name: 'safetensors',
    ecosystem: 'PyPI',
    risk: 'safe',
    safer: null,
    reason:
      'safetensors is the safe format. Chip notes this package as a sign the project is doing the right thing.',
  },
  {
    name: 'pickle',
    ecosystem: 'PyPI',
    risk: 'load_pickle',
    safer: 'safetensors or weights_only=True',
    reason:
      'Raw pickle loading executes arbitrary code; verify all .pkl/.pt loads use weights_only=True or safetensors',
  },
  {
    name: 'cloudpickle',
    ecosystem: 'PyPI',
    risk: 'load_pickle',
    safer: 'safetensors',
    reason:
      'cloudpickle extends pickle and inherits the arbitrary-code-execution risk',
  },
  // JS (npm) ----------------------------------------------------------------
  {
    name: '@huggingface/transformers',
    ecosystem: 'npm',
    risk: 'load_pickle',
    safer: 'safetensors',
    reason:
      'transformers.js loads model files via the same Hugging Face Hub pipeline; pickle-based weights execute code if present in the model repo',
  },
  {
    name: '@xenova/transformers',
    ecosystem: 'npm',
    risk: 'load_pickle',
    safer: 'safetensors',
    reason:
      'Same as @huggingface/transformers (older namespace)',
  },
  {
    name: 'onnxruntime-node',
    ecosystem: 'npm',
    risk: 'safe',
    safer: null,
    reason:
      'ONNX runtime: ONNX format is not pickle-based; safer choice for serving model weights',
  },
];

/**
 * Look up a package against the model-weight-loader list.
 * Case-insensitive on name; ecosystem-aware (a name only matches when
 * BOTH name AND ecosystem match the entry — e.g. `huggingface_hub` is
 * a PyPI package and will not match an npm scan).
 *
 * @param {string} name
 * @param {'npm'|'PyPI'} ecosystem
 * @returns {ModelWeightLoaderEntry | null}
 */
export function getModelWeightLoader(name, ecosystem) {
  if (typeof name !== 'string' || !name) return null;
  if (ecosystem !== 'npm' && ecosystem !== 'PyPI') return null;
  const lower = name.toLowerCase();
  return (
    MODEL_WEIGHT_LOADERS.find(
      (e) => e.ecosystem === ecosystem && e.name.toLowerCase() === lower,
    ) || null
  );
}
