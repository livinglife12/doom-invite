// Cheap value noise used by the burn, hologram, rift and page shaders.
export const NOISE = /* glsl */ `
float nhash(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(nhash(i+vec3(0,0,0)), nhash(i+vec3(1,0,0)), f.x), mix(nhash(i+vec3(0,1,0)), nhash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(nhash(i+vec3(0,0,1)), nhash(i+vec3(1,0,1)), f.x), mix(nhash(i+vec3(0,1,1)), nhash(i+vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ return vnoise(p)*0.5 + vnoise(p*2.03)*0.3 + vnoise(p*4.11)*0.2; }
`
