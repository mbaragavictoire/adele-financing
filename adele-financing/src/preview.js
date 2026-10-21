// Fail closed: financial/authentication interfaces require an explicit later non-preview build.
export const IS_PREVIEW_ONLY = import.meta.env.VITE_ADELE_PREVIEW_ONLY !== 'false'
