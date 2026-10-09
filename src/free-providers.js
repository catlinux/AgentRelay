/** Catálogo de proveedores disponibles en OpenCode. */
// freeTier indica proveedores con modelos gratuitos sujetos a límites aunque models.dev les asigne precio.
export const PROVIDERS = [
  {
    id: 'opencode',
    name: 'OpenCode Zen',
    env: ['OPENCODE_API_KEY'],
    signupUrl: 'https://opencode.ai/auth',
    tier: 'free',
    freeTier: false,
    limits: null,
    resetRule: null,
    trainsOnData: null,
    notes: 'Incluye modelos gratuitos.',
  },
  {
    id: 'nvidia',
    name: 'NVIDIA',
    env: ['NVIDIA_API_KEY'],
    signupUrl: 'https://build.nvidia.com/',
    tier: 'free',
    freeTier: false,
    limits: 'Aproximadamente 40 peticiones por minuto.',
    resetRule: null,
    trainsOnData: null,
    notes: '',
  },
  {
    id: 'groq',
    name: 'Groq',
    env: ['GROQ_API_KEY'],
    signupUrl: 'https://console.groq.com/keys',
    tier: 'free',
    freeTier: true,
    limits: 'Aproximadamente 1000 peticiones al día.',
    resetRule: null,
    trainsOnData: null,
    notes: '',
  },
  {
    id: 'google',
    name: 'Google',
    env: ['GOOGLE_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'GEMINI_API_KEY'],
    signupUrl: 'https://aistudio.google.com/app/apikey',
    tier: 'free',
    freeTier: true,
    limits: null,
    resetRule: null,
    trainsOnData: true,
    notes: '',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    env: ['MISTRAL_API_KEY'],
    signupUrl: 'https://console.mistral.ai/api-keys/',
    tier: 'free',
    freeTier: true,
    limits: null,
    resetRule: null,
    trainsOnData: null,
    notes: '',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    env: ['OPENROUTER_API_KEY'],
    signupUrl: 'https://openrouter.ai/settings/keys',
    tier: 'free',
    freeTier: false,
    limits: 'Los modelos :free permiten aproximadamente 50 peticiones al día.',
    resetRule: null,
    trainsOnData: null,
    notes: '',
  },
  {
    id: 'zai',
    name: 'Z.AI',
    env: ['ZHIPU_API_KEY'],
    signupUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    tier: 'free',
    freeTier: false,
    limits: null,
    resetRule: null,
    trainsOnData: null,
    notes: '',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    env: ['DEEPSEEK_API_KEY'],
    signupUrl: 'https://platform.deepseek.com/api_keys',
    tier: 'paid',
    freeTier: false,
    limits: null,
    resetRule: null,
    trainsOnData: null,
    notes: '',
  },
];

export function getProvider(id) {
  return PROVIDERS.find((provider) => provider.id === id) ?? null;
}

export function connectedProviders({ env = process.env, opencodeAuth = [] } = {}) {
  const authenticated = new Set(opencodeAuth);
  return PROVIDERS.filter((provider) => authenticated.has(provider.id)
    || provider.env.some((name) => typeof env[name] === 'string' && env[name].trim() !== ''));
}
