export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'three') return { url: new URL('../lib/three.module.js', import.meta.url).href, format: 'module', shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: new URL('../lib/jsm/' + specifier.slice(13), import.meta.url).href, format: 'module', shortCircuit: true };
  const result = await nextResolve(specifier, context);
  if (result.url.startsWith(new URL('../', import.meta.url).href) && result.url.endsWith('.js')) result.format = 'module';
  return result;
}
