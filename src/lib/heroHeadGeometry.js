import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { taperedTube } from './figure'

// Canonical, centred heads, approximately .116 wide by .15 tall. Relics and animated
// characters share these surfaces, lenses and costume seams rather than approximating them twice.
const geometryCache = new Map()
const memo = (key, make) => {
  if (!geometryCache.has(key)) geometryCache.set(key, make())
  return geometryCache.get(key)
}
const clamp = (value, a = 0, b = 1) => Math.max(a, Math.min(b, value))
const bell = (value, center, width) => Math.exp(-(((value - center) / width) ** 2))
const PROFILES = {
  human: [[-.076, .012, .025], [-.065, .032, .038], [-.043, .044, .047], [-.015, .052, .05], [.015, .053, .048], [.044, .052, .046], [.065, .04, .033], [.079, .002, .002]],
  female: [[-.073, .009, .022], [-.06, .025, .037], [-.035, .038, .044], [-.008, .047, .048], [.02, .05, .046], [.046, .049, .043], [.065, .036, .029], [.077, .002, .002]],
  hulk: [[-.074, .026, .032], [-.06, .047, .047], [-.036, .053, .051], [-.008, .06, .052], [.024, .062, .052], [.05, .057, .046], [.068, .044, .034], [.08, .002, .002]],
  ironman: [[-.076, .022, .028], [-.063, .038, .039], [-.037, .049, .044], [-.005, .055, .049], [.025, .056, .048], [.052, .05, .042], [.071, .035, .028], [.08, .002, .002]],
  panther: [[-.077, .014, .023], [-.064, .03, .035], [-.039, .046, .045], [-.012, .054, .049], [.017, .056, .05], [.044, .054, .046], [.067, .04, .034], [.081, .002, .002]],
  spider: [[-.075, .013, .024], [-.061, .029, .036], [-.038, .041, .044], [-.012, .049, .049], [.018, .052, .05], [.048, .048, .044], [.067, .035, .03], [.078, .002, .002]],
  ben: [[-.073, .031, .031], [-.06, .047, .042], [-.035, .055, .048], [-.005, .059, .05], [.027, .06, .05], [.053, .052, .043], [.074, .035, .027], [.082, .002, .002]],
}
function profile(kind, y) {
  const values = PROFILES[kind] || PROFILES.human
  let index = 0
  while (index < values.length - 2 && y > values[index + 1][0]) index++
  const [a, b] = [values[index], values[index + 1]]
  const t = clamp((y - a[0]) / (b[0] - a[0]))
  return [THREE.MathUtils.lerp(a[1], b[1], t), THREE.MathUtils.lerp(a[2], b[2], t)]
}
function front(kind, x, y) {
  const [width, depth] = profile(kind, y)
  const ratio = clamp(Math.abs(x) / Math.max(width, .001))
  let z = depth * Math.pow(Math.max(0, 1 - ratio ** 2), .24)
  const masked = ['ironman', 'panther', 'spider'].includes(kind)
  if (!masked) {
    z += bell(x, 0, .009) * bell(y, -.008, .024) * (kind === 'hulk' ? .021 : .018)
    z += bell(Math.abs(x), .025, .015) * bell(y, .027, .008) * (kind === 'hulk' ? .012 : .005)
    z -= bell(Math.abs(x), .023, .014) * bell(y, .012, .007) * .004
    z += bell(x, 0, .025) * bell(y, -.052, .012) * .006
  } else if (kind === 'panther') {
    z += bell(x, 0, .012) * bell(y, -.012, .026) * .008
    z += bell(Math.abs(x), .034, .014) * bell(y, -.019, .014) * .006
  } else if (kind === 'spider') z += bell(x, 0, .01) * bell(y, -.009, .024) * .009
  return z
}
function shell(kind, from = -.076, key = kind, omit) {
  return memo(`shell:${key}:${from}`, () => {
    const positions = [], uvs = [], indices = []
    const rows = kind === 'ben' ? 18 : 34, columns = kind === 'ben' ? 28 : 48
    for (let row = 0; row <= rows; row++) {
      const y = THREE.MathUtils.lerp(from, .08, row / rows)
      const [width, depth] = profile(kind, y)
      for (let col = 0; col <= columns; col++) {
        const theta = col / columns * Math.PI * 2
        const x = Math.sin(theta) * width
        const cosine = Math.cos(theta)
        let z = cosine >= 0 ? front(kind, x, y) : cosine * depth
        if (kind === 'ben') z += Math.sin(col * 2.3 + row * 1.9) * .0014
        positions.push(x, y, z); uvs.push(col / columns, row / rows)
      }
    }
    for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
      const a = row * (columns + 1) + col, b = a + columns + 1
      if (omit) {
        const middle = new THREE.Vector3(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2])
        if (omit(middle)) continue
      }
      indices.push(a, a + 1, b, a + 1, b + 1, b)
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
    geometry.setIndex(indices); geometry.computeVertexNormals()
    return geometry
  })
}
function path2(points, hole = false) {
  const result = hole ? new THREE.Path() : new THREE.Shape()
  points.forEach(([x, y], index) => index ? result.lineTo(x, y) : result.moveTo(x, y))
  result.closePath()
  return result
}
function panel(key, points, z, holes = [], bevel = .0008) {
  return memo(`panel:${key}`, () => {
    const outline = path2(points)
    holes.forEach(points => outline.holes.push(path2(points, true)))
    const geometry = new THREE.ExtrudeGeometry(outline, { depth: .0015, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 })
    const position = geometry.attributes.position
    for (let index = 0; index < position.count; index++) {
      const x = position.getX(index), y = position.getY(index)
      position.setZ(index, position.getZ(index) + (typeof z === 'function' ? z(x, y) : z))
    }
    geometry.computeVertexNormals()
    return geometry
  })
}
function ribbon(key, points, radius = .001) {
  return memo(`ribbon:${key}`, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point))), Math.max(8, points.length * 5), radius, 6, false))
}
function mirror(points, side) { return points.map(([x, y]) => [x * side, y]) }
const eyeOutline = [[.009, .017], [.02, .021], [.037, .019], [.035, .009], [.02, .006], [.012, .009]]
const pantherEye = [[.01, .017], [.026, .025], [.044, .025], [.033, .009], [.015, .008]]
const ironEye = [[.01, .022], [.043, .025], [.036, .014], [.012, .014]]
const spiderEye = [[.007, .024], [.016, .047], [.043, .053], [.048, .03], [.035, -.016], [.021, -.025], [.011, -.008]]

// Materials are borrowed, geometries are cached. Callers own material disposal; never dispose
// the geometry from this builder. Faceplate is a separate hinged group for the relic animation.
export function buildHeroHead(id, palette, { shadows = false, maskOnly = false } = {}) {
  const { primary, secondary = primary, skin = primary, hair = primary, metal = primary, eye = primary } = palette
  const root = new THREE.Group()
  root.name = `${id}-sculpted-head`
  const faces = new THREE.Group()
  root.add(faces)
  const meshes = []
  const add = (geometry, material = primary, parent = faces) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = shadows; parent.add(mesh); meshes.push(mesh)
    return mesh
  }
  const mark = (key, points, material, kind = 'human', offset = .002, parent = faces) => add(panel(`${id}:${key}`, points, (x, y) => front(kind, x, y) + offset), material, parent)
  const trace = (key, points, material = hair, radius = .001, parent = faces) => add(ribbon(`${id}:${key}`, points, radius), material, parent)
  const contour = (key, points, material, kind = 'human', radius = .0008) => trace(key, points.map(([x, y]) => [x, y, front(kind, x, y) + .002]), material, radius)
  const humanKind = id === 'sue' ? 'female' : id === 'hulk' ? 'hulk' : id === 'ben' ? 'ben' : 'human'
  let faceplate = null

  if (id === 'ironman') {
    add(shell('ironman'), primary)
    const pivot = new THREE.Vector3(0, .063, .018)
    faceplate = new THREE.Group(); faceplate.position.copy(pivot); root.add(faceplate)
    faceplate.userData.restPosition = pivot.clone()
    faceplate.userData.restRotation = faceplate.rotation.clone()
    const plateOutline = [[-.043, .067], [-.018, .073], [0, .065], [.018, .073], [.043, .067], [.052, .034], [.043, -.004], [.031, -.017], [.027, -.056], [.017, -.07], [-.017, -.07], [-.027, -.056], [-.031, -.017], [-.043, -.004], [-.052, .034]]
    const plateZ = (x, y) => .054 - Math.abs(x) * .21 + bell(x, 0, .014) * bell(y, -.005, .035) * .014 - Math.max(0, -y - .04) * .12
    const plate = add(panel('ironman:faceplate', plateOutline, plateZ, [-1, 1].map(s => mirror(ironEye, s)), .0012), secondary, faceplate)
    plate.position.copy(pivot).multiplyScalar(-1)
    for (const side of [-1, 1]) {
      const lens = add(panel(`ironman:lens:${side}`, mirror(ironEye, side), (x, y) => plateZ(x, y) - .001, [], .0002), eye, faceplate)
      lens.position.copy(pivot).multiplyScalar(-1)
      mark(`temple:${side}`, mirror([[.044, .04], [.056, .025], [.052, -.025], [.036, -.047], [.032, -.013]], side), hair, 'ironman', .002)
      const brow = add(ribbon(`ironman:brow:${side}`, mirror([[.008, .03], [.025, .034], [.044, .03]], side).map(([x, y]) => [x, y, plateZ(x, y) + .002]), .0014), secondary, faceplate)
      brow.position.copy(pivot).multiplyScalar(-1)
    }
    const mouth = add(panel('ironman:mouth', [[-.019, -.043], [.019, -.043], [.015, -.047], [-.015, -.047]], plateZ, [], .0001), hair, faceplate)
    mouth.position.copy(pivot).multiplyScalar(-1)
    mark('jaw-frame', [[-.034, -.025], [-.027, -.062], [-.016, -.075], [.016, -.075], [.027, -.062], [.034, -.025], [.025, -.052], [.015, -.062], [-.015, -.062], [-.025, -.052]], primary, 'ironman', .003)
  } else if (id === 'panther') {
    add(shell('panther'), primary)
    for (const side of [-1, 1]) {
      mark(`ear:${side}`, mirror([[.035, .056], [.057, .107], [.062, .047]], side), primary, 'panther', -.002)
      mark(`inner-ear:${side}`, mirror([[.043, .061], [.055, .094], [.057, .055]], side), hair, 'panther', .002)
      mark(`eye-rim:${side}`, mirror(pantherEye.map(([x, y]) => [x, (y - .016) * 1.28 + .016]), side), hair, 'panther', .003)
      mark(`eye:${side}`, mirror(pantherEye, side), eye, 'panther', .005)
      mark(`cheek:${side}`, mirror([[.048, .009], [.054, -.009], [.034, -.044], [.025, -.057], [.035, -.019]], side), secondary, 'panther', .0025)
      contour(`brow:${side}`, mirror([[.006, .033], [.026, .04], [.049, .04]], side), metal, 'panther', .001)
      contour(`temple:${side}`, mirror([[.028, .065], [.044, .048], [.051, .015], [.04, -.022], [.027, -.047]], side), metal, 'panther', .0009)
      contour(`cheek-cut:${side}`, mirror([[.049, -.012], [.036, -.033], [.021, -.05]], side), metal, 'panther', .0008)
    }
    mark('nose', [[0, .017], [.008, -.004], [0, -.014], [-.008, -.004]], hair, 'panther', .004)
    contour('mouth', [[-.017, -.037], [0, -.04], [.017, -.037]], hair, 'panther', .001)
    contour('forehead-v', [[-.025, .066], [0, .035], [.025, .066]], metal, 'panther', .001)
  } else if (id === 'spider') {
    add(shell('spider'), primary)
    for (const side of [-1, 1]) {
      mark(`rim:${side}`, mirror(spiderEye, side), hair, 'spider', .0025)
      mark(`lens:${side}`, mirror(spiderEye.map(([x, y]) => [.027 + (x - .027) * .79, .012 + (y - .012) * .83]), side), eye, 'spider', .005)
    }
    // Web paths conform to the sculpted fabric surface and pass beneath the raised lenses.
    for (let spoke = 0; spoke < 12; spoke++) {
      const angle = spoke / 12 * Math.PI * 2
      const points = Array.from({ length: 13 }, (_, n) => {
        const t = n / 12
        return [Math.cos(angle) * .048 * t, Math.sin(angle) * .071 * t]
      }).filter(([x, y]) => Math.abs(x) < profile('spider', y)[0] * .98)
      if (points.length > 1) contour(`web-spoke:${spoke}`, points, hair, 'spider', .00055)
    }
    for (let ring = 1; ring <= 5; ring++) {
      const points = Array.from({ length: 49 }, (_, n) => {
        const angle = n / 48 * Math.PI * 2, scale = ring / 5
        const scallop = 1 - .045 * Math.cos(angle * 12)
        const y = Math.sin(angle) * .068 * scale * scallop
        const width = Math.min(.048 * scale, profile('spider', y)[0] * .94)
        return [Math.cos(angle) * width * scallop, y]
      })
      contour(`web-ring:${ring}`, points, hair, 'spider', .0005)
    }
  } else if (!maskOnly) {
    add(shell(humanKind), skin)
    for (const side of [-1, 1]) {
      mark(`eye-socket:${side}`, mirror(eyeOutline, side), hair, humanKind, .0015)
      mark(`eye-white:${side}`, mirror(eyeOutline.map(([x, y]) => [.024 + (x - .024) * .75, .013 + (y - .013) * .53]), side), eye, humanKind, .003)
      mark(`iris:${side}`, mirror([[.022, .018], [.027, .018], [.027, .009], [.022, .009]], side), hair, humanKind, .004)
      const angry = id === 'hulk' || id === 'ben'
      contour(`eyebrow:${side}`, mirror([[.01, angry ? .027 : .028], [.024, angry ? .034 : .031], [.04, .028]], side), hair, humanKind, angry ? .0036 : .0016)
      contour(`nostril:${side}`, mirror([[.003, -.017], [.009, -.02], [.013, -.016]], side), hair, humanKind, .00055)
    }
    contour('mouth', [[-.02, -.041], [-.009, -.039], [0, -.041], [.009, -.039], [.02, -.041]], hair, humanKind, .0009)
    if (id === 'hulk' || id === 'ben') {
      mark('mouth-shadow', [[-.024, -.033], [.024, -.033], [.021, -.047], [-.021, -.047]], hair, humanKind, .002)
      mark('teeth', [[-.02, -.035], [.02, -.035], [.018, -.04], [-.018, -.04]], eye, humanKind, .0035)
    }

    if (id === 'ben') {
      // Fitted rock facets and inset seams form an actual jaw/brow rather than floating pebbles.
      const plates = [
        [[-.048,.055],[-.02,.071],[-.005,.045],[-.027,.036]], [[.048,.055],[.02,.071],[.005,.045],[.027,.036]],
        [[-.047,.029],[-.012,.031],[-.008,.019],[-.043,.015]], [[.047,.029],[.012,.031],[.008,.019],[.043,.015]],
        [[-.052,.006],[-.033,.008],[-.026,-.018],[-.047,-.024]], [[.052,.006],[.033,.008],[.026,-.018],[.047,-.024]],
        [[-.043,-.03],[-.027,-.024],[-.026,-.055],[-.039,-.055]], [[.043,-.03],[.027,-.024],[.026,-.055],[.039,-.055]],
        [[-.022,-.05],[.022,-.05],[.025,-.064],[0,-.073],[-.025,-.064]],
      ]
      plates.forEach((points, index) => {
        mark(`stone:${index}`, points, index % 3 ? primary : skin, 'ben', .003 + index % 2 * .001)
        contour(`stone-seam:${index}`, [...points, points[0]], hair, 'ben', .0008)
      })
    } else if (id === 'johnny') {
      const flames = [[-.045,.042,-.008],[-.031,.073,.0],[-.01,.119,-.014],[.012,.084,.004],[.036,.106,-.015],[.05,.049,-.01]]
      for (let i = 0; i < flames.length - 1; i++) {
        const [x, y, z] = flames[i]
        add(memo(`johnny:flame:${i}`, () => taperedTube(new THREE.CatmullRomCurve3([new THREE.Vector3(x, .035, -.012), new THREE.Vector3(x * .85, y * .75, z), new THREE.Vector3(x * .7 + .008, y, z - .012)]), .014, .0004, 18, 7)), i % 2 ? secondary : metal)
      }
      contour('flame-ridge', [[-.036,.039],[-.02,.054],[0,.045],[.025,.06],[.042,.04]], secondary, 'human', .002)
    } else {
      // A sculpted hair cap with a deliberate hairline; long styles continue into curved locks.
      const long = ['loki', 'thor', 'sue'].includes(id)
      const hairCap = memo(`hair-cap:${id}`, () => {
        const geometry = shell(humanKind, -.076, `hair-base:${id}`).clone()
        const position = geometry.attributes.position
        const indices = geometry.index.array, keep = []
        const minimum = id === 'hulk' ? .037 : .039
        for (let index = 0; index < indices.length; index += 3) {
          const p = indices[index], x = position.getX(p), y = position.getY(p), z = position.getZ(p)
          const hairline = minimum + (id === 'strange' || id === 'loki' ? -.014 * bell(x, 0, .015) : .004 * Math.sin(x * 65))
          if (y > hairline || (z < -.012 && y > (long ? -.075 : -.005))) keep.push(indices[index], indices[index + 1], indices[index + 2])
        }
        geometry.setIndex(keep)
        for (let index = 0; index < position.count; index++) {
          position.setXYZ(index, position.getX(index) * 1.045, position.getY(index) + .003, position.getZ(index) * 1.045)
        }
        geometry.computeVertexNormals(); return geometry
      })
      add(hairCap, hair)
      for (const side of [-1, 1]) {
        if (long) {
          const curtain = [[.032,.052],[.052,.041],[.061,.004],[.058,-.045],[.047,-.094],[.029,-.079],[.041,-.025],[.037,.014]]
          add(panel(`${id}:hair-curtain:${side}`, mirror(curtain, side), (x,y)=>-.02 + Math.sin(y*35)*.003 + Math.abs(x)*.12, [], .001), hair)
          for (let lock = 0; lock < 3; lock++) {
            const x = side * (.042 + lock * .004)
            trace(`long-lock:${side}:${lock}`, [[x*.85,.04,-.012],[x,.004,-.012],[x*1.04,-.038,-.01],[x*.88,-.079,-.015]], id === 'sue' || id === 'thor' ? metal : hair, .00065)
          }
        }
        if (id === 'strange' || id === 'reed') mark(`grey-temple:${side}`, mirror([[.043,.043],[.053,.032],[.051,.005],[.043,.015]], side), metal, humanKind, .003)
      }
      for (let lock = 0; lock < 5; lock++) {
        const x = (lock - 2) * .012
        trace(`hair-ridge:${lock}`, [[x,.051,.033],[x + .005,.071,.005],[x,.063,-.032]], id === 'sue' || id === 'thor' ? metal : hair, .0012)
      }
      if (id === 'strange' || id === 'thor') {
        mark('mustache', [[-.025,-.026],[-.011,-.024],[0,-.03],[.011,-.024],[.025,-.026],[.016,-.035],[0,-.033],[-.016,-.035]], hair, humanKind, .002)
        mark('beard', id === 'strange' ? [[-.018,-.044],[-.01,-.06],[0,-.075],[.01,-.06],[.018,-.044],[.009,-.049],[0,-.046],[-.009,-.049]] : [[-.039,-.03],[-.025,-.063],[0,-.088],[.025,-.063],[.039,-.03],[.024,-.045],[0,-.051],[-.024,-.045]], hair, humanKind, .003)
      }
      if (id === 'hulk') for (let tuft = 0; tuft < 6; tuft++) {
        const x = -.04 + tuft * .016
        mark(`hair-tuft:${tuft}`, [[x-.01,.049],[x,.084+(tuft%2)*.008],[x+.012,.047]], hair, 'hulk', -.002)
      }
    }
  }

  if (id === 'loki') {
    add(shell('human', .038, 'loki-helmet'), metal)
    mark('crown', [[-.054,.033],[-.045,.067],[-.023,.057],[0,.039],[.023,.057],[.045,.067],[.054,.033],[.033,.025],[0,.031],[-.033,.025]], metal, 'human', .006)
    for (const side of [-1, 1]) {
      add(memo(`loki:horn:${side}`, () => taperedTube(new THREE.CatmullRomCurve3([[side*.04,.052,.035],[side*.073,.108,.024],[side*.085,.184,-.025],[side*.057,.235,-.078]].map(point => new THREE.Vector3(...point))), .013, .0008, 32, 10)), metal)
      contour(`crown-groove:${side}`, mirror([[.011,.038],[.03,.053],[.043,.06]], side), secondary, 'human', .001)
    }
  }
  if (id === 'thor') {
    add(shell('human', .033, 'thor-helmet'), metal)
    contour('helmet-brow', [[-.052,.035],[-.025,.03],[0,.036],[.025,.03],[.052,.035]], secondary, 'human', .002)
    for (const side of [-1, 1]) {
      const wing = [[.05,.044],[.065,.078],[.091,.119],[.118,.136],[.102,.104],[.122,.112],[.099,.083],[.117,.085],[.087,.059],[.097,.056],[.064,.032]]
      add(panel(`thor:wing:${side}`, mirror(wing, side), -.005, [], .0015), metal)
      trace(`wing-spine:${side}`, [[side*.058,.042,.001],[side*.084,.08,.001],[side*.11,.125,.001]], secondary, .0013)
    }
  }
  if (id === 'cap') {
    // The cowl leaves the sculpted mouth and jaw exposed, with eye holes in its brow panel.
    add(shell('human', .031, 'cap-cowl'), primary)
    const cowl = [[-.054,.034],[-.043,.046],[0,.04],[.043,.046],[.054,.034],[.05,-.019],[.034,-.035],[.029,-.003],[.013,-.008],[0,-.024],[-.013,-.008],[-.029,-.003],[-.034,-.035],[-.05,-.019]]
    add(panel('cap:cowl-front', cowl, (x,y)=>front('human',x,y)+.003, [-1,1].map(side=>mirror(eyeOutline.map(([x,y])=>[x,(y-.013)*1.5+.013]),side))), primary)
    add(panel('cap:A', [[-.015,.046],[-.006,.072],[.006,.072],[.015,.046],[.008,.046],[.005,.054],[-.005,.054],[-.008,.046]], (x,y)=>front('human',x,y)+.006, [[[-.003,.059],[.003,.059],[0,.067]]], .0002), metal)
    for (const side of [-1,1]) {
      add(panel(`cap:wing:${side}`, mirror([[.052,.027],[.069,.05],[.095,.058],[.082,.043],[.096,.044],[.079,.031],[.087,.028],[.064,.014]], side), -.001, [], .0004), metal)
      contour(`cowl-cheek:${side}`, mirror([[.043,.004],[.039,-.018],[.034,-.031]], side), secondary, 'human', .0007)
    }
  }

  // One draw per material per moving part; cached component geometry stays reusable.
  for (const group of [faces, faceplate].filter(Boolean)) {
    const batches = new Map()
    for (const mesh of [...group.children]) {
      const list = batches.get(mesh.material) || []; list.push(mesh); batches.set(mesh.material, list)
    }
    for (const [material, pieces] of batches) {
      if (pieces.length < 2) continue
      const signature = pieces.map(mesh => `${mesh.geometry.uuid}:${mesh.position.toArray().join(',')}`).join('|')
      const geometry = memo(`batch:${id}:${signature}`, () => {
        const geometries = pieces.map(mesh => {
          mesh.updateMatrix()
          return (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrix)
        })
        const merged = mergeGeometries(geometries, false)
        geometries.forEach(item => item.dispose())
        return merged
      })
      if (!geometry) continue
      pieces.forEach(mesh => group.remove(mesh))
      add(geometry, material, group)
    }
  }
  const finalMeshes = []
  root.traverse(object => { if (object.isMesh) finalMeshes.push(object) })
  return { root, faceplate, meshes: finalMeshes }
}
