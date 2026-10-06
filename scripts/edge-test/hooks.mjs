export async function resolve(specifier, context, next) {
  if (specifier.startsWith('https://esm.sh/@supabase/supabase-js')) {
    return next(new URL('../../node_modules/@supabase/supabase-js/dist/index.mjs', import.meta.url).pathname, context)
  }
  return next(specifier, context)
}
