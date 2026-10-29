import * as THREE from 'three'
import { NOISE } from './noise'
import { stoneTex } from './textures'

// Adds a world-space noise dissolve to any MeshStandardMaterial: a white-hot front, Doom's green flame,
// an orange ember band and charred surface behind it. Drive it with mat.userData.uBurn.value (0 intact, 1 gone).
export function burnable(mat, edge = '#5dff7a') {
  const uBurn = { value: 0 }
  const uEdge = { value: new THREE.Color(edge) }
  mat.userData.uBurn = uBurn
  mat.onBeforeCompile = (s) => {
    s.uniforms.uBurn = uBurn
    s.uniforms.uEdge = uEdge
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBurnPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvBurnPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vBurnPos;\nuniform float uBurn;\nuniform vec3 uEdge;\n${NOISE}`)
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float bThr = uBurn * 1.3 - 0.15;
        float bN = fbm(vBurnPos * 2.2) * 0.75 + fbm(vBurnPos * 9.0) * 0.25 - vBurnPos.y * 0.015;
        if (uBurn > 0.001 && bN < bThr) discard;`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        if (uBurn > 0.001) {
          float d = bN - bThr;
          float hot = 1.0 - smoothstep(0.0, 0.012, d);
          float flame = 1.0 - smoothstep(0.0, 0.045, d);
          float ember = 1.0 - smoothstep(0.03, 0.11, d);
          float charr = 1.0 - smoothstep(0.06, 0.2, d);
          diffuseColor.rgb *= 1.0 - charr * 0.92;
          totalEmissiveRadiance += vec3(1.0, 0.95, 0.85) * hot * 6.0 + uEdge * flame * 5.0 + vec3(1.0, 0.38, 0.06) * (ember - flame) * 2.5;
        }`
      )
  }
  mat.customProgramCacheKey = () => 'burnable'
  return mat
}

export function shrineMats() {
  return {
    stone: burnable(new THREE.MeshStandardMaterial({ map: stoneTex([1, 1]), color: '#8a8d88', roughness: 0.72, metalness: 0.08 })),
    darkStone: burnable(new THREE.MeshStandardMaterial({ map: stoneTex([1, 2]), color: '#3d3f3c', roughness: 0.55, metalness: 0.15 })),
    metal: burnable(new THREE.MeshStandardMaterial({ color: '#2a2c2e', roughness: 0.3, metalness: 0.95 })),
    gold: burnable(new THREE.MeshStandardMaterial({ color: '#b8924a', roughness: 0.28, metalness: 1 })),
    glow: burnable(new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ff9a3c', emissiveIntensity: 2.4 })),
    figurine: burnable(new THREE.MeshStandardMaterial({ map: stoneTex([1, 1]), color: '#b3ada0', roughness: 0.5, metalness: 0.1 })),
  }
}

// Hologram: builds up from the projector (uBuild = world y of the scan front), interlaced scanlines,
// travelling interference bands, hot fresnel edges, flicker, glitch displacement and noise dissolve.
export function holoMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uGlitch: { value: 0 },
      uDissolve: { value: 0 },
      uWipe: { value: -100 },
      uBuild: { value: 100 },
      uCorrupt: { value: 0 },
      uGrey: { value: 0 },
    },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uGlitch;
      varying vec3 vN; varying vec3 vW; varying vec3 vV;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        float band = step(0.86, fract(sin(floor(w.y * 26.0 + floor(uTime * 14.0)) * 12.9898) * 43758.5453));
        w.x += band * uGlitch * 0.035 * sin(uTime * 70.0);
        w.z += band * uGlitch * 0.02 * cos(uTime * 53.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime, uOpacity, uDissolve, uWipe, uBuild, uCorrupt, uGrey;
      varying vec3 vN; varying vec3 vW; varying vec3 vV;
      ${NOISE}
      void main(){
        if (vW.y < uWipe || vW.y > uBuild) discard;
        float n = fbm(vW * 18.0 + vec3(0.0, uTime * 0.5, 0.0));
        float thr = uDissolve * 1.2 - 0.1;
        if (uDissolve > 0.001 && n < thr) discard;
        float facing = clamp(abs(dot(normalize(vN + 1e-5), normalize(vV))), 0.0, 1.0);
        float fr = pow(1.0 - facing, 1.7);
        float inter = mix(0.55, 1.0, step(0.5, fract(vW.y * 260.0)));
        float band = pow(max(0.0, 1.0 - abs(fract(vW.y * 1.4 - uTime * 0.35) - 0.5) * 2.0), 18.0);
        float flick = 0.9 + 0.1 * sin(uTime * 41.0) * sin(uTime * 17.0);
        float grain = nhash(vec3(gl_FragCoord.xy, floor(uTime * 30.0)));
        vec3 col = mix(uColor, vec3(0.8), uGrey);
        col = mix(col, vec3(0.3, 1.0, 0.5), uCorrupt);
        float edge = uDissolve > 0.001 ? 1.0 - smoothstep(0.0, 0.05, n - thr) : 0.0;
        float wipeEdge = 1.0 - smoothstep(0.0, 0.012, vW.y - uWipe);
        float buildEdge = 1.0 - smoothstep(0.0, 0.02, uBuild - vW.y);
        float body = (0.1 + fr * 1.35) * inter * flick * (0.85 + grain * 0.3) + band * 0.5;
        vec3 rgb = col * body + vec3(1.0) * pow(fr, 5.0) * 0.6 + (col + 0.6) * (edge * 1.2 + wipeEdge + buildEdge * 1.5);
        float a = body + edge * 1.2 + wipeEdge + buildEdge;
        gl_FragColor = vec4(rgb, clamp(a * uOpacity, 0.0, 1.0));
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

export function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime, uOpacity; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float f = pow(clamp(abs(dot(normalize(vN + 1e-5), normalize(vV))), 0.0, 1.0), 1.5);
        float a = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.6) * 0.4 * f;
        a *= 0.75 + 0.25 * sin(vUv.y * 90.0 - uTime * 6.0);
        a *= 0.85 + 0.15 * sin(uTime * 23.0);
        gl_FragColor = vec4(uColor, a * uOpacity);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

export function additive(color, opacity = 1, map = null) {
  return new THREE.MeshBasicMaterial({
    color,
    map,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

export function riftMaterial(a = '#33ff77', b = '#ff2a3a') {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpen: { value: 0 }, uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) }, uSeed: { value: Math.random() * 10 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOpen, uSeed; uniform vec3 uA, uB; varying vec2 vUv;
      ${NOISE}
      void main(){
        vec2 p = vUv - 0.5;
        float n = fbm(vec3(p.y * 5.0, uSeed, uTime * 0.25));
        float w = uOpen * 0.2 * (1.0 - smoothstep(0.25, 0.5, abs(p.y)));
        float d = abs(p.x + (n - 0.5) * 0.3 * uOpen);
        float inside = 1.0 - smoothstep(w * 0.55, w, d);
        float edge = (1.0 - smoothstep(0.0, 0.035, abs(d - w * 0.8))) * step(0.002, w);
        float sw = fbm(vec3(p * 9.0 + vec2(uTime * 0.2, -uTime * 0.5), uSeed + uTime * 0.3));
        float stars = step(0.985, nhash(vec3(floor(vUv * 220.0), uSeed)));
        vec3 col = mix(uA, uB, smoothstep(0.35, 0.7, sw)) * (0.25 + sw * 1.2) * inside + stars * inside;
        col += (uA * 2.2 + 0.6) * edge;
        float a = max(inside * 0.95, edge);
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  })
}

export function portalMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime, uOpacity; varying vec2 vUv;
      ${NOISE}
      void main(){
        vec2 p = vUv - 0.5; float r = length(p) * 2.0; float a = atan(p.y, p.x);
        float sw = fbm(vec3(cos(a) * 2.0 + r * 3.0 - uTime * 0.8, sin(a) * 2.0 - r * 2.0, uTime * 0.2));
        vec3 col = mix(vec3(0.01, 0.07, 0.04), vec3(0.22, 0.55, 0.32), sw) * (1.2 - r);
        col += vec3(0.85, 0.95, 0.8) * pow(max(0.0, 1.0 - r), 6.0) * 0.6;
        gl_FragColor = vec4(col, smoothstep(1.0, 0.85, r) * uOpacity);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
}
