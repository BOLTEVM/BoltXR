/**
 * lib/gems/studioEnv.ts — the jewellery studio the stones see.
 *
 * Diamonds look like what they reflect. A real catalogue shot lights them
 * with big soft boxes, hard strip lights and a ceiling of tiny LEDs on a
 * black set — so that is what this builds (procedurally, offline-safe, no
 * HDR download), rendered once into:
 *
 *   cube  — a sharp HDR cube map the gem shader samples for reflection,
 *           refraction and fire (mip-free: sparkle needs the hard edges);
 *   pmrem — a prefiltered copy for the metals (gold, platinum, ceramic).
 *
 * `keyDirs` / `keyColors` are the brightest sources, handed to the gem and
 * glint shaders so analytic sparkles line up with what the cube shows.
 */

import {
    BackSide, BoxGeometry, Color, CubeCamera, DoubleSide, Float32BufferAttribute, Group, HalfFloatType, LinearFilter, LinearMipmapLinearFilter, Mesh,
    MeshBasicMaterial, PlaneGeometry, PMREMGenerator, Scene, SphereGeometry, Texture, Vector3, WebGLCubeRenderTarget,
    type CubeTexture, type WebGLRenderer,
} from 'three';

export interface StudioEnvironment {
    cube: CubeTexture;
    pmrem: Texture;
    keyDirs: Vector3[];
    keyColors: Color[];
    dispose(): void;
}

function softbox(w: number, h: number, intensity: number, tint = new Color(1, 1, 1)): Mesh {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: tint.clone().multiplyScalar(intensity), side: DoubleSide }));
    return m;
}

/**
 * Build the studio set (radius ≈ 10–30 units around the origin): a light
 * tent — bright dome, dimmer floor — broken up by black flags so stones get
 * the white/black contrast pattern of a jewellery shoot, then hard strips,
 * a big overhead key and a ceiling of pin LEDs for the scintillation.
 */
export function buildStudioScene(): { scene: Scene; keys: { dir: Vector3; color: Color }[] } {
    const scene = new Scene();
    scene.background = new Color(0.02, 0.02, 0.022);
    const set = new Group();
    scene.add(set);

    // tent dome: vertex-coloured gradient, bright above, falling to a dark floor
    const domeGeo = new SphereGeometry(30, 48, 24);
    const pos = domeGeo.getAttribute('position');
    const col: number[] = [];
    for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i) / 30;
        const k = y > 0 ? 0.55 + 1.05 * Math.pow(y, 0.7) : 0.55 * Math.pow(1 + y, 2.2) + 0.03;
        col.push(k * 1.0, k * 0.985, k * 0.97);
    }
    domeGeo.setAttribute('color', new Float32BufferAttribute(col, 3));
    set.add(new Mesh(domeGeo, new MeshBasicMaterial({ vertexColors: true, side: BackSide })));

    // black flags round the horizon: the dark facets that give a stone contrast
    const flagMat = new MeshBasicMaterial({ color: new Color(0.004, 0.004, 0.005), side: DoubleSide });
    for (const [az, el, w, h] of [[20, 5, 7, 12], [95, -5, 5, 14], [160, 10, 8, 10], [235, 0, 6, 13], [300, -8, 7, 11], [60, 40, 6, 5], [200, 45, 7, 5]] as const) {
        const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
        const f = new Mesh(new PlaneGeometry(w, h), flagMat);
        f.position.set(Math.sin(a) * Math.cos(e) * 14, Math.sin(e) * 14, Math.cos(a) * Math.cos(e) * 14);
        f.lookAt(0, 0, 0);
        set.add(f);
    }
    const floor = new Mesh(new BoxGeometry(60, 0.1, 60), new MeshBasicMaterial({ color: new Color(0.03, 0.028, 0.03) }));
    floor.position.y = -7;
    set.add(floor);

    const keys: { dir: Vector3; color: Color }[] = [];
    const place = (m: Mesh, p: [number, number, number], intensity: number, color: Color, key: boolean) => {
        m.position.set(...p);
        m.lookAt(0, 0, 0);
        set.add(m);
        if (key) keys.push({ dir: new Vector3(...p).normalize(), color: color.clone().multiplyScalar(intensity / 8) });
    };
    // key: big overhead soft box, slightly in front
    place(softbox(9, 6, 7), [0, 9, 4], 7, new Color(1, 1, 1), true);
    // hard strips left and right (long flashes along baguettes and bracelet links)
    place(softbox(1.2, 12, 16, new Color(1, 0.97, 0.92)), [-9, 2, 3], 16, new Color(1, 0.97, 0.92), true);
    place(softbox(1.2, 12, 13, new Color(0.92, 0.96, 1)), [9, 1, 2], 13, new Color(0.92, 0.96, 1), true);
    // warm rim from behind, cool kicker low front
    place(softbox(10, 2, 6, new Color(1, 0.9, 0.78)), [0, 3, -10], 6, new Color(1, 0.9, 0.78), false);
    place(softbox(6, 1.4, 4, new Color(0.85, 0.92, 1)), [3, -2, 9], 4, new Color(0.85, 0.92, 1), false);

    // ceiling of pin LEDs: the high-frequency points that make pavé scintillate
    const ledGeo = new SphereGeometry(0.09, 6, 4);
    const ledMat = new MeshBasicMaterial({ color: new Color(1, 1, 1).multiplyScalar(70) });
    const ledWarm = new MeshBasicMaterial({ color: new Color(1, 0.85, 0.6).multiplyScalar(55) });
    let n = 0;
    for (let ring = 1; ring <= 6; ring++) {
        const count = ring * 9;
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + ring * 0.37;
            const el = 0.22 + ring * 0.12;
            const r = 11;
            const led = new Mesh(ledGeo, (n++ % 3 === 0) ? ledWarm : ledMat);
            led.position.set(Math.sin(el) * Math.cos(a) * r, Math.cos(el) * r, Math.sin(el) * Math.sin(a) * r);
            set.add(led);
        }
    }
    for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const led = new Mesh(ledGeo, ledMat);
        led.position.set(Math.cos(a) * 12, 0.5 + Math.sin(i * 1.7) * 1.8, Math.sin(a) * 12);
        led.scale.setScalar(1.6);
        set.add(led);
    }
    return { scene, keys };
}

/** Render the studio into a sharp cube (gems) and a PMREM (metals). */
export function createStudioEnvironment(renderer: WebGLRenderer, size = 256): StudioEnvironment {
    const { scene, keys } = buildStudioScene();
    // mipmapped: where a facet's double bounce minifies the studio, the stone samples a
    // filtered level instead of aliasing into speckle; magnified flashes stay razor sharp
    const rt = new WebGLCubeRenderTarget(size, { type: HalfFloatType, generateMipmaps: true, minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter });
    const cam = new CubeCamera(0.05, 100, rt);
    scene.add(cam);
    const prevTarget = renderer.getRenderTarget();
    const prevXr = renderer.xr.enabled;
    renderer.xr.enabled = false; // a cube capture is never stereo
    cam.update(renderer, scene);
    const pm = new PMREMGenerator(renderer);
    const pmremRT = pm.fromScene(scene, 0.0);
    pm.dispose();
    renderer.xr.enabled = prevXr;
    renderer.setRenderTarget(prevTarget);
    scene.traverse(o => {
        const m = o as Mesh;
        if (m.isMesh) {
            m.geometry.dispose();
            (m.material as MeshBasicMaterial).dispose();
        }
    });
    return {
        cube: rt.texture,
        pmrem: pmremRT.texture,
        keyDirs: keys.map(k => k.dir),
        keyColors: keys.map(k => k.color),
        dispose() {
            rt.dispose();
            pmremRT.dispose();
        },
    };
}
