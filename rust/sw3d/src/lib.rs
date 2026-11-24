//! HandLab Software 3D Rasterizer (Rust -> WebAssembly, zero dependencies).
//!
//! Renders parametric 3D solids, polylines, floor grid, bounding box,
//! cross-section slice indicator, and a 3D cursor into an RGBA8 linear
//! framebuffer + f32 Z-buffer, allowing HandLab to run in full 3D on a plain
//! 2D `<canvas>` when WebGL is unavailable or software-rendered.
//!
//! Performance notes:
//! - Zero per-frame heap allocations: `Canvas` and `Scene` are split so mesh,
//!   object, and polyline slices are borrowed directly during rasterization.
//! - Incremental edge-equation rasterizer: barycentric weights and depth step
//!   via addition in the inner pixel loop rather than per-pixel multiplies.

use std::f32::consts::PI;

const TAU: f32 = PI * 2.0;

#[derive(Clone, Copy, Debug, Default)]
struct Vec3 {
    x: f32,
    y: f32,
    z: f32,
}

impl Vec3 {
    #[inline]
    const fn new(x: f32, y: f32, z: f32) -> Self {
        Self { x, y, z }
    }
    #[inline]
    fn add(self, o: Self) -> Self {
        Self::new(self.x + o.x, self.y + o.y, self.z + o.z)
    }
    #[inline]
    fn sub(self, o: Self) -> Self {
        Self::new(self.x - o.x, self.y - o.y, self.z - o.z)
    }
    #[inline]
    fn scale(self, s: f32) -> Self {
        Self::new(self.x * s, self.y * s, self.z * s)
    }
    #[inline]
    fn dot(self, o: Self) -> f32 {
        self.x * o.x + self.y * o.y + self.z * o.z
    }
    #[inline]
    fn cross(self, o: Self) -> Self {
        Self::new(
            self.y * o.z - self.z * o.y,
            self.z * o.x - self.x * o.z,
            self.x * o.y - self.y * o.x,
        )
    }
    #[inline]
    fn len(self) -> f32 {
        self.dot(self).sqrt()
    }
    #[inline]
    fn normalize(self) -> Self {
        let l = self.len();
        if l > 1e-6 {
            self.scale(1.0 / l)
        } else {
            Self::new(0.0, 1.0, 0.0)
        }
    }
    #[inline]
    fn rotate_y(self, a: f32) -> Self {
        let (s, c) = a.sin_cos();
        Self::new(self.x * c + self.z * s, self.y, -self.x * s + self.z * c)
    }
    #[inline]
    fn rotate_x(self, a: f32) -> Self {
        let (s, c) = a.sin_cos();
        Self::new(self.x, self.y * c - self.z * s, self.y * s + self.z * c)
    }
}

struct Mesh {
    verts: Vec<Vec3>,
    norms: Vec<Vec3>,
    tris: Vec<[u32; 3]>,
}

impl Mesh {
    fn new() -> Self {
        Self {
            verts: Vec::new(),
            norms: Vec::new(),
            tris: Vec::new(),
        }
    }

    fn push_quad(&mut self, a: Vec3, b: Vec3, c: Vec3, d: Vec3, n: Vec3) {
        let base = self.verts.len() as u32;
        self.verts.extend_from_slice(&[a, b, c, d]);
        self.norms.extend_from_slice(&[n, n, n, n]);
        self.tris.push([base, base + 1, base + 2]);
        self.tris.push([base, base + 2, base + 3]);
    }

    fn push_tri_flat(&mut self, a: Vec3, b: Vec3, c: Vec3) {
        let n = b.sub(a).cross(c.sub(a)).normalize();
        let base = self.verts.len() as u32;
        self.verts.extend_from_slice(&[a, b, c]);
        self.norms.extend_from_slice(&[n, n, n]);
        self.tris.push([base, base + 1, base + 2]);
    }
}

/* ---------- procedural parametric solids (15 shapes) ---------- */

fn seg_for(base: u32, detail: u8) -> u32 {
    let k = match detail {
        0 => 0.55,
        2 => 1.5,
        _ => 1.0,
    };
    ((base as f32 * k).round() as u32).max(3)
}

fn build_box(hx: f32, hy: f32, hz: f32) -> Mesh {
    let mut m = Mesh::new();
    m.push_quad(
        Vec3::new(-hx, -hy, hz),
        Vec3::new(hx, -hy, hz),
        Vec3::new(hx, hy, hz),
        Vec3::new(-hx, hy, hz),
        Vec3::new(0.0, 0.0, 1.0),
    );
    m.push_quad(
        Vec3::new(hx, -hy, -hz),
        Vec3::new(-hx, -hy, -hz),
        Vec3::new(-hx, hy, -hz),
        Vec3::new(hx, hy, -hz),
        Vec3::new(0.0, 0.0, -1.0),
    );
    m.push_quad(
        Vec3::new(hx, -hy, hz),
        Vec3::new(hx, -hy, -hz),
        Vec3::new(hx, hy, -hz),
        Vec3::new(hx, hy, hz),
        Vec3::new(1.0, 0.0, 0.0),
    );
    m.push_quad(
        Vec3::new(-hx, -hy, -hz),
        Vec3::new(-hx, -hy, hz),
        Vec3::new(-hx, hy, hz),
        Vec3::new(-hx, hy, -hz),
        Vec3::new(-1.0, 0.0, 0.0),
    );
    m.push_quad(
        Vec3::new(-hx, hy, hz),
        Vec3::new(hx, hy, hz),
        Vec3::new(hx, hy, -hz),
        Vec3::new(-hx, hy, -hz),
        Vec3::new(0.0, 1.0, 0.0),
    );
    m.push_quad(
        Vec3::new(-hx, -hy, -hz),
        Vec3::new(hx, -hy, -hz),
        Vec3::new(hx, -hy, hz),
        Vec3::new(-hx, -hy, hz),
        Vec3::new(0.0, -1.0, 0.0),
    );
    m
}

fn build_sphere(r: f32, u_segs: u32, v_segs: u32, max_phi: f32) -> Mesh {
    let mut m = Mesh::new();
    for iy in 0..=v_segs {
        let v = iy as f32 / v_segs as f32;
        let phi = v * max_phi;
        let (sp, cp) = phi.sin_cos();
        for ix in 0..=u_segs {
            let u = ix as f32 / u_segs as f32;
            let theta = u * TAU;
            let (st, ct) = theta.sin_cos();
            let n = Vec3::new(sp * ct, cp, sp * st);
            m.verts.push(n.scale(r));
            m.norms.push(n);
        }
    }
    let stride = u_segs + 1;
    for iy in 0..v_segs {
        for ix in 0..u_segs {
            let a = iy * stride + ix;
            let b = a + 1;
            let c = a + stride;
            let d = c + 1;
            if iy > 0 {
                m.tris.push([a, d, b]);
            }
            if iy + 1 < v_segs || max_phi < PI - 0.01 {
                m.tris.push([a, c, d]);
            }
        }
    }
    if max_phi < PI - 0.01 {
        let y = r * max_phi.cos();
        let rad = r * max_phi.sin();
        let center = m.verts.len() as u32;
        m.verts.push(Vec3::new(0.0, y, 0.0));
        m.norms.push(Vec3::new(0.0, -1.0, 0.0));
        let ring = m.verts.len() as u32;
        for ix in 0..=u_segs {
            let theta = (ix as f32 / u_segs as f32) * TAU;
            let (st, ct) = theta.sin_cos();
            m.verts.push(Vec3::new(rad * ct, y, rad * st));
            m.norms.push(Vec3::new(0.0, -1.0, 0.0));
        }
        for ix in 0..u_segs {
            m.tris.push([center, ring + ix, ring + ix + 1]);
        }
    }
    m
}

fn build_cylinder(rt: f32, rb: f32, h: f32, segs: u32, rot_y: f32) -> Mesh {
    let mut m = Mesh::new();
    let hy = h * 0.5;
    let slope = (rb - rt) / h.max(1e-4);
    for i in 0..segs {
        let a0 = (i as f32 / segs as f32) * TAU + rot_y;
        let a1 = ((i + 1) as f32 / segs as f32) * TAU + rot_y;
        let (s0, c0) = a0.sin_cos();
        let (s1, c1) = a1.sin_cos();
        let p00 = Vec3::new(rb * c0, -hy, rb * s0);
        let p10 = Vec3::new(rb * c1, -hy, rb * s1);
        let p11 = Vec3::new(rt * c1, hy, rt * s1);
        let p01 = Vec3::new(rt * c0, hy, rt * s0);
        if segs <= 6 {
            if rt > 1e-4 {
                let n = p10.sub(p00).cross(p01.sub(p00)).normalize();
                m.push_quad(p00, p01, p11, p10, n);
            } else {
                m.push_tri_flat(p00, p01, p10);
            }
        } else {
            let n0 = Vec3::new(c0, slope, s0).normalize();
            let n1 = Vec3::new(c1, slope, s1).normalize();
            let base = m.verts.len() as u32;
            m.verts.extend_from_slice(&[p00, p01, p11, p10]);
            m.norms.extend_from_slice(&[n0, n0, n1, n1]);
            if rt > 1e-4 {
                m.tris.push([base, base + 1, base + 2]);
                m.tris.push([base, base + 2, base + 3]);
            } else {
                m.tris.push([base, base + 1, base + 3]);
            }
        }
        let bc = Vec3::new(0.0, -hy, 0.0);
        let base = m.verts.len() as u32;
        m.verts.extend_from_slice(&[bc, p00, p10]);
        m.norms.extend_from_slice(&[
            Vec3::new(0.0, -1.0, 0.0),
            Vec3::new(0.0, -1.0, 0.0),
            Vec3::new(0.0, -1.0, 0.0),
        ]);
        m.tris.push([base, base + 1, base + 2]);
        if rt > 1e-4 {
            let tc = Vec3::new(0.0, hy, 0.0);
            let base = m.verts.len() as u32;
            m.verts.extend_from_slice(&[tc, p11, p01]);
            m.norms.extend_from_slice(&[
                Vec3::new(0.0, 1.0, 0.0),
                Vec3::new(0.0, 1.0, 0.0),
                Vec3::new(0.0, 1.0, 0.0),
            ]);
            m.tris.push([base, base + 1, base + 2]);
        }
    }
    m
}

fn build_torus(major: f32, minor: f32, u_segs: u32, v_segs: u32) -> Mesh {
    let mut m = Mesh::new();
    for j in 0..=v_segs {
        let v = (j as f32 / v_segs as f32) * TAU;
        let (sv, cv) = v.sin_cos();
        for i in 0..=u_segs {
            let u = (i as f32 / u_segs as f32) * TAU;
            let (su, cu) = u.sin_cos();
            let r = major + minor * cv;
            let pos = Vec3::new(r * cu, minor * sv, r * su);
            let center = Vec3::new(major * cu, 0.0, major * su);
            let norm = pos.sub(center).normalize();
            m.verts.push(pos);
            m.norms.push(norm);
        }
    }
    let stride = u_segs + 1;
    for j in 0..v_segs {
        for i in 0..u_segs {
            let a = j * stride + i;
            let b = a + 1;
            let c = a + stride;
            let d = c + 1;
            m.tris.push([a, b, d]);
            m.tris.push([a, d, c]);
        }
    }
    m
}

fn build_torus_knot(major: f32, tube: f32, u_segs: u32, v_segs: u32) -> Mesh {
    let mut m = Mesh::new();
    let p = 2.0_f32;
    let q = 3.0_f32;
    let curve = |t: f32| -> Vec3 {
        let qt = q * t;
        let pt = p * t;
        let r = (2.0 + qt.cos()) * 0.5 * major;
        Vec3::new(r * pt.cos(), qt.sin() * 0.5 * major, r * pt.sin())
    };
    for i in 0..=u_segs {
        let t = (i as f32 / u_segs as f32) * TAU;
        let p0 = curve(t);
        let p1 = curve(t + 0.01);
        let tang = p1.sub(p0).normalize();
        let up = if tang.y.abs() < 0.9 {
            Vec3::new(0.0, 1.0, 0.0)
        } else {
            Vec3::new(1.0, 0.0, 0.0)
        };
        let nrm = tang.cross(up).normalize();
        let bin = tang.cross(nrm).normalize();
        for j in 0..=v_segs {
            let a = (j as f32 / v_segs as f32) * TAU;
            let (sa, ca) = a.sin_cos();
            let dir = nrm.scale(ca).add(bin.scale(sa)).normalize();
            m.verts.push(p0.add(dir.scale(tube)));
            m.norms.push(dir);
        }
    }
    let stride = v_segs + 1;
    for i in 0..u_segs {
        for j in 0..v_segs {
            let a = i * stride + j;
            let b = a + stride;
            let c = a + 1;
            let d = b + 1;
            m.tris.push([a, b, d]);
            m.tris.push([a, d, c]);
        }
    }
    m
}

fn build_tetra(r: f32) -> Mesh {
    let mut m = Mesh::new();
    let v = [
        Vec3::new(1.0, 1.0, 1.0).normalize().scale(r),
        Vec3::new(-1.0, -1.0, 1.0).normalize().scale(r),
        Vec3::new(-1.0, 1.0, -1.0).normalize().scale(r),
        Vec3::new(1.0, -1.0, -1.0).normalize().scale(r),
    ];
    m.push_tri_flat(v[0], v[2], v[1]);
    m.push_tri_flat(v[0], v[1], v[3]);
    m.push_tri_flat(v[0], v[3], v[2]);
    m.push_tri_flat(v[1], v[2], v[3]);
    m
}

fn build_octa(r: f32) -> Mesh {
    let mut m = Mesh::new();
    let top = Vec3::new(0.0, r, 0.0);
    let bot = Vec3::new(0.0, -r, 0.0);
    let ring = [
        Vec3::new(r, 0.0, 0.0),
        Vec3::new(0.0, 0.0, r),
        Vec3::new(-r, 0.0, 0.0),
        Vec3::new(0.0, 0.0, -r),
    ];
    for i in 0..4 {
        let a = ring[i];
        let b = ring[(i + 1) % 4];
        m.push_tri_flat(top, b, a);
        m.push_tri_flat(bot, a, b);
    }
    m
}

fn build_icosa(r: f32) -> Mesh {
    let mut m = Mesh::new();
    let t = (1.0 + 5.0_f32.sqrt()) * 0.5;
    let raw = [
        (-1.0, t, 0.0),
        (1.0, t, 0.0),
        (-1.0, -t, 0.0),
        (1.0, -t, 0.0),
        (0.0, -1.0, t),
        (0.0, 1.0, t),
        (0.0, -1.0, -t),
        (0.0, 1.0, -t),
        (t, 0.0, -1.0),
        (t, 0.0, 1.0),
        (-t, 0.0, -1.0),
        (-t, 0.0, 1.0),
    ];
    let v: Vec<Vec3> = raw
        .iter()
        .map(|&(x, y, z)| Vec3::new(x, y, z).normalize().scale(r))
        .collect();
    let faces: [[usize; 3]; 20] = [
        [0, 11, 5],
        [0, 5, 1],
        [0, 1, 7],
        [0, 7, 10],
        [0, 10, 11],
        [1, 5, 9],
        [5, 11, 4],
        [11, 10, 2],
        [10, 7, 6],
        [7, 1, 8],
        [3, 9, 4],
        [3, 4, 2],
        [3, 2, 6],
        [3, 6, 8],
        [3, 8, 9],
        [4, 9, 5],
        [2, 4, 11],
        [6, 2, 10],
        [8, 6, 7],
        [9, 8, 1],
    ];
    for f in faces {
        m.push_tri_flat(v[f[0]], v[f[1]], v[f[2]]);
    }
    m
}

fn build_capsule(r: f32, half_cyl: f32, u_segs: u32, cap_rings: u32) -> Mesh {
    let mut m = Mesh::new();
    let mut profile: Vec<(f32, f32, f32, f32)> = Vec::new();
    for i in 0..=cap_rings {
        let a = (i as f32 / cap_rings as f32) * (PI * 0.5);
        let (sa, ca) = a.sin_cos();
        profile.push((r * sa, half_cyl + r * ca, sa, ca));
    }
    for i in 0..=cap_rings {
        let a = (i as f32 / cap_rings as f32) * (PI * 0.5);
        let (sa, ca) = a.sin_cos();
        profile.push((r * ca, -half_cyl - r * sa, ca, -sa));
    }
    let rings = profile.len() as u32;
    for &(rad, y, nr, ny) in &profile {
        for ix in 0..=u_segs {
            let theta = (ix as f32 / u_segs as f32) * TAU;
            let (st, ct) = theta.sin_cos();
            m.verts.push(Vec3::new(rad * ct, y, rad * st));
            m.norms.push(Vec3::new(nr * ct, ny, nr * st).normalize());
        }
    }
    let stride = u_segs + 1;
    for iy in 0..(rings - 1) {
        for ix in 0..u_segs {
            let a = iy * stride + ix;
            let b = a + 1;
            let c = a + stride;
            let d = c + 1;
            m.tris.push([a, d, b]);
            m.tris.push([a, c, d]);
        }
    }
    m
}

fn build_shape_mesh(shape_id: u8, detail: u8) -> Mesh {
    match shape_id {
        0 => build_box(0.31, 0.31, 0.31),
        1 => build_sphere(0.4, seg_for(32, detail), seg_for(18, detail), PI),
        2 => build_cylinder(0.0, 0.4, 0.8, seg_for(32, detail), 0.0),
        3 => build_torus(0.34, 0.13, seg_for(36, detail), seg_for(18, detail)),
        4 => build_cylinder(0.34, 0.34, 0.7, seg_for(32, detail), 0.0),
        5 => build_icosa(0.46),
        6 => build_torus_knot(0.34, 0.1, seg_for(72, detail), seg_for(12, detail)),
        7 => build_tetra(0.54),
        8 => build_octa(0.52),
        9 => build_capsule(0.28, 0.25, seg_for(24, detail), seg_for(8, detail)),
        10 => build_box(0.275, 0.3, 0.25),
        11 => build_cylinder(0.0, 0.42, 0.7, 4, PI * 0.25),
        12 => build_sphere(0.4, seg_for(28, detail), seg_for(14, detail), PI * 0.5),
        13 => build_cylinder(0.36, 0.36, 0.6, 6, 0.0),
        14 => build_cylinder(0.4, 0.4, 0.6, 3, 0.0),
        _ => build_box(0.31, 0.31, 0.31),
    }
}

/* ---------- split Canvas + Scene for zero-clone rendering ---------- */

#[derive(Clone, Copy)]
struct SceneObj {
    shape_id: u8,
    pos: Vec3,
    scale: Vec3,
    rot_y: f32,
    rot_x: f32,
    color: [u8; 3],
    flags: u8, // bit 0 = hovered, bit 1 = selected
}

struct SceneLine {
    pts: Vec<Vec3>,
    closed: bool,
    color: [u8; 3],
}

#[inline]
fn unpack_rgb(hex: u32) -> [u8; 3] {
    [
        ((hex >> 16) & 0xff) as u8,
        ((hex >> 8) & 0xff) as u8,
        (hex & 0xff) as u8,
    ]
}

struct Canvas {
    width: usize,
    height: usize,
    fb: Vec<u8>,
    zbuf: Vec<f32>,

    cam_yaw: f32,
    cam_pitch: f32,
    cam_dist: f32,
    cam_pos: Vec3,
    cam_right: Vec3,
    cam_up: Vec3,
    cam_fwd: Vec3,
    fov_scale: f32,

    bg_rgb: [u8; 3],
    grid_main_rgb: [u8; 3],
    grid_center_rgb: [u8; 3],
    bounds_rgb: [u8; 3],
    show_grid: bool,
    wireframe: bool,
    mat_mode: u8,
    clip_axis: u8,
    clip_pos: f32,

    cursor_pos: Vec3,
    cursor_rgb: [u8; 3],
    show_cursor: bool,

    last_proj: [f32; 3],
    last_unproj: [f32; 2],
}

impl Canvas {
    fn new() -> Self {
        let mut c = Self {
            width: 1,
            height: 1,
            fb: vec![0; 4],
            zbuf: vec![f32::INFINITY; 1],
            cam_yaw: 0.0,
            cam_pitch: 0.25,
            cam_dist: 8.8,
            cam_pos: Vec3::new(0.0, 2.2, 8.5),
            cam_right: Vec3::new(1.0, 0.0, 0.0),
            cam_up: Vec3::new(0.0, 1.0, 0.0),
            cam_fwd: Vec3::new(0.0, 0.0, -1.0),
            fov_scale: 1.0,
            bg_rgb: [252, 252, 249],
            grid_main_rgb: [232, 229, 222],
            grid_center_rgb: [214, 211, 203],
            bounds_rgb: [226, 223, 215],
            show_grid: true,
            wireframe: false,
            mat_mode: 0,
            clip_axis: 0,
            clip_pos: 0.0,
            cursor_pos: Vec3::new(0.0, 0.0, 0.0),
            cursor_rgb: [1, 106, 113],
            show_cursor: true,
            last_proj: [0.0; 3],
            last_unproj: [0.0; 2],
        };
        c.update_camera();
        c
    }

    fn resize(&mut self, w: usize, h: usize) {
        let w = w.max(1).min(2560);
        let h = h.max(1).min(1440);
        if w == self.width && h == self.height {
            return;
        }
        self.width = w;
        self.height = h;
        self.fb.resize(w * h * 4, 255);
        self.zbuf.resize(w * h, f32::INFINITY);
        self.update_camera();
    }

    fn update_camera(&mut self) {
        let cp = self.cam_pitch.clamp(-1.35, 1.35);
        let (sp, ccp) = cp.sin_cos();
        let (sy, cy) = self.cam_yaw.sin_cos();
        self.cam_pos = Vec3::new(
            self.cam_dist * ccp * sy,
            self.cam_dist * sp,
            self.cam_dist * ccp * cy,
        );
        self.cam_fwd = Vec3::new(-self.cam_pos.x, -self.cam_pos.y, -self.cam_pos.z).normalize();
        let world_up = Vec3::new(0.0, 1.0, 0.0);
        self.cam_right = self.cam_fwd.cross(world_up).normalize();
        self.cam_up = self.cam_right.cross(self.cam_fwd).normalize();
        let half_fov = (55.0_f32 * 0.5).to_radians();
        self.fov_scale = (self.height as f32 * 0.5) / half_fov.tan();
    }

    #[inline]
    fn world_to_cam(&self, p: Vec3) -> Vec3 {
        let rel = p.sub(self.cam_pos);
        Vec3::new(
            rel.dot(self.cam_right),
            rel.dot(self.cam_up),
            rel.dot(self.cam_fwd),
        )
    }

    #[inline]
    fn project_cam(&self, c: Vec3) -> Option<(f32, f32, f32)> {
        if c.z <= 0.15 {
            return None;
        }
        let inv_z = self.fov_scale / c.z;
        let sx = (self.width as f32 * 0.5) + c.x * inv_z;
        let sy = (self.height as f32 * 0.5) - c.y * inv_z;
        Some((sx, sy, c.z))
    }

    /// Intersect a ray through normalized viewport coordinates `(u, v) in [0, 1]`
    /// with the `z = 0` work plane so pointer picking matches any 3D orbit angle.
    fn unproject_z0(&mut self, u: f32, v: f32) -> bool {
        let sx = u * self.width as f32;
        let sy = v * self.height as f32;
        let cx = (sx - self.width as f32 * 0.5) / self.fov_scale;
        let cy = (self.height as f32 * 0.5 - sy) / self.fov_scale;
        let dir = self
            .cam_fwd
            .add(self.cam_right.scale(cx))
            .add(self.cam_up.scale(cy))
            .normalize();
        if dir.z.abs() < 1e-4 {
            return false;
        }
        let t = -self.cam_pos.z / dir.z;
        if t <= 0.0 {
            return false;
        }
        let hit = self.cam_pos.add(dir.scale(t));
        self.last_unproj = [hit.x.clamp(-4.2, 4.2), hit.y.clamp(-2.6, 2.6)];
        true
    }

    #[inline]
    fn clipped(&self, p: Vec3) -> bool {
        match self.clip_axis {
            1 => p.x > self.clip_pos,
            2 => p.y > self.clip_pos,
            3 => p.z > self.clip_pos,
            _ => false,
        }
    }

    fn clear(&mut self) {
        let [r, g, b] = self.bg_rgb;
        for px in self.fb.chunks_exact_mut(4) {
            px[0] = r;
            px[1] = g;
            px[2] = b;
            px[3] = 255;
        }
        for z in &mut self.zbuf {
            *z = f32::INFINITY;
        }
    }

    #[inline]
    fn put_px(&mut self, x: i32, y: i32, z: f32, rgb: [u8; 3]) {
        if x < 0 || y < 0 {
            return;
        }
        let ux = x as usize;
        let uy = y as usize;
        if ux >= self.width || uy >= self.height {
            return;
        }
        let idx = uy * self.width + ux;
        if z < self.zbuf[idx] {
            self.zbuf[idx] = z;
            let o = idx * 4;
            self.fb[o] = rgb[0];
            self.fb[o + 1] = rgb[1];
            self.fb[o + 2] = rgb[2];
            self.fb[o + 3] = 255;
        }
    }

    fn draw_line_3d(&mut self, a: Vec3, b: Vec3, rgb: [u8; 3], thick: bool) {
        let mut ca = self.world_to_cam(a);
        let mut cb = self.world_to_cam(b);
        let near = 0.2_f32;
        if ca.z < near && cb.z < near {
            return;
        }
        if ca.z < near {
            let t = (near - ca.z) / (cb.z - ca.z);
            ca = ca.add(cb.sub(ca).scale(t));
        } else if cb.z < near {
            let t = (near - cb.z) / (ca.z - cb.z);
            cb = cb.add(ca.sub(cb).scale(t));
        }
        let (x0, y0, z0) = match self.project_cam(ca) {
            Some(p) => p,
            None => return,
        };
        let (x1, y1, z1) = match self.project_cam(cb) {
            Some(p) => p,
            None => return,
        };
        let dx = x1 - x0;
        let dy = y1 - y0;
        let steps = dx.abs().max(dy.abs()).min(1600.0);
        if steps < 0.5 {
            self.put_px(x0 as i32, y0 as i32, z0 - 0.01, rgb);
            return;
        }
        let n = steps as i32;
        let inv = 1.0 / n as f32;
        for i in 0..=n {
            let t = i as f32 * inv;
            let px = (x0 + dx * t) as i32;
            let py = (y0 + dy * t) as i32;
            let pz = z0 + (z1 - z0) * t - 0.015;
            self.put_px(px, py, pz, rgb);
            if thick {
                self.put_px(px + 1, py, pz, rgb);
                self.put_px(px, py + 1, pz, rgb);
            }
        }
    }

    fn draw_grid_and_bounds(&mut self) {
        if self.show_grid {
            let y = -2.6_f32;
            let half = 7.0_f32;
            for i in -7..=7 {
                let c = if i == 0 {
                    self.grid_center_rgb
                } else {
                    self.grid_main_rgb
                };
                let f = i as f32;
                self.draw_line_3d(Vec3::new(f, y, -half), Vec3::new(f, y, half), c, false);
                self.draw_line_3d(Vec3::new(-half, y, f), Vec3::new(half, y, f), c, false);
            }
        }
        let hx = 4.2_f32;
        let y0 = -2.6_f32;
        let y1 = 2.8_f32;
        let hz = 4.0_f32;
        let c = self.bounds_rgb;
        let pts = [
            Vec3::new(-hx, y0, -hz),
            Vec3::new(hx, y0, -hz),
            Vec3::new(hx, y0, hz),
            Vec3::new(-hx, y0, hz),
            Vec3::new(-hx, y1, -hz),
            Vec3::new(hx, y1, -hz),
            Vec3::new(hx, y1, hz),
            Vec3::new(-hx, y1, hz),
        ];
        let edges = [
            (0, 1), (1, 2), (2, 3), (3, 0),
            (4, 5), (5, 6), (6, 7), (7, 4),
            (0, 4), (1, 5), (2, 6), (3, 7),
        ];
        for (a, b) in edges {
            self.draw_line_3d(pts[a], pts[b], c, false);
        }

        // Visual indicator frame for the active cross-section slice plane
        if self.clip_axis != 0 {
            let sc = [14, 165, 233];
            let p = self.clip_pos;
            let quad = match self.clip_axis {
                1 => [
                    Vec3::new(p, -2.4, -3.6),
                    Vec3::new(p, -2.4, 3.6),
                    Vec3::new(p, 2.4, 3.6),
                    Vec3::new(p, 2.4, -3.6),
                ],
                2 => [
                    Vec3::new(-3.8, p, -3.6),
                    Vec3::new(3.8, p, -3.6),
                    Vec3::new(3.8, p, 3.6),
                    Vec3::new(-3.8, p, 3.6),
                ],
                _ => [
                    Vec3::new(-3.8, -2.4, p),
                    Vec3::new(3.8, -2.4, p),
                    Vec3::new(3.8, 2.4, p),
                    Vec3::new(-3.8, 2.4, p),
                ],
            };
            self.draw_line_3d(quad[0], quad[1], sc, false);
            self.draw_line_3d(quad[1], quad[2], sc, false);
            self.draw_line_3d(quad[2], quad[3], sc, false);
            self.draw_line_3d(quad[3], quad[0], sc, false);
        }
    }

    fn draw_mesh(&mut self, obj: &SceneObj, mesh: &Mesh) {
        let key_light = Vec3::new(4.0, 7.0, 5.0).normalize();
        let rim_light = Vec3::new(-5.0, 3.0, -4.0).normalize();
        let w_f = self.width as i32;
        let h_f = self.height as i32;

        // Soft floor contact ring directly under the object
        let floor_y = -2.59_f32;
        let shadow_r = 0.35 * obj.scale.x.max(obj.scale.z);
        let shadow_rgb = [
            (self.bg_rgb[0] as f32 * 0.86) as u8,
            (self.bg_rgb[1] as f32 * 0.86) as u8,
            (self.bg_rgb[2] as f32 * 0.86) as u8,
        ];
        for i in 0..12 {
            let a0 = (i as f32 / 12.0) * TAU;
            let a1 = ((i + 1) as f32 / 12.0) * TAU;
            self.draw_line_3d(
                Vec3::new(obj.pos.x + a0.cos() * shadow_r, floor_y, obj.pos.z + a0.sin() * shadow_r),
                Vec3::new(obj.pos.x + a1.cos() * shadow_r, floor_y, obj.pos.z + a1.sin() * shadow_r),
                shadow_rgb,
                false,
            );
        }

        for tri in &mesh.tris {
            let i0 = tri[0] as usize;
            let i1 = tri[1] as usize;
            let i2 = tri[2] as usize;

            let xform_p = |v: Vec3| -> Vec3 {
                let s = Vec3::new(v.x * obj.scale.x, v.y * obj.scale.y, v.z * obj.scale.z);
                s.rotate_x(obj.rot_x).rotate_y(obj.rot_y).add(obj.pos)
            };
            let wp0 = xform_p(mesh.verts[i0]);
            let wp1 = xform_p(mesh.verts[i1]);
            let wp2 = xform_p(mesh.verts[i2]);

            if self.clip_axis != 0 && self.clipped(wp0) && self.clipped(wp1) && self.clipped(wp2) {
                continue;
            }

            let cp0 = self.world_to_cam(wp0);
            let cp1 = self.world_to_cam(wp1);
            let cp2 = self.world_to_cam(wp2);
            if cp0.z <= 0.15 || cp1.z <= 0.15 || cp2.z <= 0.15 {
                continue;
            }

            let (sx0, sy0, sz0) = match self.project_cam(cp0) {
                Some(p) => p,
                None => continue,
            };
            let (sx1, sy1, sz1) = match self.project_cam(cp1) {
                Some(p) => p,
                None => continue,
            };
            let (sx2, sy2, sz2) = match self.project_cam(cp2) {
                Some(p) => p,
                None => continue,
            };

            let area = (sx1 - sx0) * (sy2 - sy0) - (sy1 - sy0) * (sx2 - sx0);
            if !self.wireframe && self.clip_axis == 0 && area >= 0.0 {
                continue;
            }

            if self.wireframe {
                self.draw_line_3d(wp0, wp1, obj.color, false);
                self.draw_line_3d(wp1, wp2, obj.color, false);
                self.draw_line_3d(wp2, wp0, obj.color, false);
                continue;
            }

            if area.abs() < 0.25 {
                continue;
            }

            let min_x = sx0.min(sx1).min(sx2).floor().max(0.0) as i32;
            let max_x = sx0.max(sx1).max(sx2).ceil().min((w_f - 1) as f32) as i32;
            let min_y = sy0.min(sy1).min(sy2).floor().max(0.0) as i32;
            let max_y = sy0.max(sy1).max(sy2).ceil().min((h_f - 1) as f32) as i32;
            if min_x > max_x || min_y > max_y {
                continue;
            }

            let flip = if area > 0.0 { -1.0_f32 } else { 1.0_f32 };
            let sel_boost = if (obj.flags & 2) != 0 { 0.12_f32 } else { 0.0 };
            let smooth = self.mat_mode != 2;

            // Precompute world-space vertex normals & half-vector for smooth Phong shading
            let n0 = mesh.norms[i0].rotate_x(obj.rot_x).rotate_y(obj.rot_y).scale(flip);
            let n1 = mesh.norms[i1].rotate_x(obj.rot_x).rotate_y(obj.rot_y).scale(flip);
            let n2 = mesh.norms[i2].rotate_x(obj.rot_x).rotate_y(obj.rot_y).scale(flip);
            let center = wp0.add(wp1).add(wp2).scale(1.0 / 3.0);
            let half_v = key_light.add(self.cam_pos.sub(center).normalize()).normalize();

            // Precompute flat color for faceted mode (mat_mode == 2)
            let flat_shaded = if !smooth {
                let fnrm = wp1.sub(wp0).cross(wp2.sub(wp0)).normalize().scale(flip);
                let ndl = fnrm.dot(key_light).max(0.0);
                let ndr = fnrm.dot(rim_light).max(0.0);
                let lum = 0.28 + 0.62 * ndl + 0.12 * ndr + sel_boost;
                [
                    ((obj.color[0] as f32 * lum).clamp(0.0, 255.0)) as u8,
                    ((obj.color[1] as f32 * lum).clamp(0.0, 255.0)) as u8,
                    ((obj.color[2] as f32 * lum).clamp(0.0, 255.0)) as u8,
                ]
            } else {
                [0, 0, 0]
            };

            let inv_area = 1.0 / area;
            let dw0_dx = (sy1 - sy2) * inv_area;
            let dw0_dy = (sx2 - sx1) * inv_area;
            let dw1_dx = (sy2 - sy0) * inv_area;
            let dw1_dy = (sx0 - sx2) * inv_area;
            let dw2_dx = -dw0_dx - dw1_dx;
            let dw2_dy = -dw0_dy - dw1_dy;

            let start_x = min_x as f32 + 0.5;
            let start_y = min_y as f32 + 0.5;
            let mut w0_row = ((sx1 - start_x) * (sy2 - start_y) - (sy1 - start_y) * (sx2 - start_x)) * inv_area;
            let mut w1_row = ((sx2 - start_x) * (sy0 - start_y) - (sy2 - start_y) * (sx0 - start_x)) * inv_area;
            let mut w2_row = 1.0 - w0_row - w1_row;

            let dz_dx = sz0 * dw0_dx + sz1 * dw1_dx + sz2 * dw2_dx;
            let dz_dy = sz0 * dw0_dy + sz1 * dw1_dy + sz2 * dw2_dy;
            let mut z_row = sz0 * w0_row + sz1 * w1_row + sz2 * w2_row;

            let do_clip = self.clip_axis != 0
                && (self.clipped(wp0) || self.clipped(wp1) || self.clipped(wp2));
            let is_clay = self.mat_mode == 1;
            let cr = obj.color[0] as f32;
            let cg = obj.color[1] as f32;
            let cb = obj.color[2] as f32;

            let width = self.width;
            for py in min_y..=max_y {
                let mut w0 = w0_row;
                let mut w1 = w1_row;
                let mut w2 = w2_row;
                let mut z = z_row;
                let row = py as usize * width;
                for px in min_x..=max_x {
                    if w0 >= 0.0 && w1 >= 0.0 && w2 >= 0.0 {
                        let keep = if do_clip {
                            let wx = wp0.x * w0 + wp1.x * w1 + wp2.x * w2;
                            let wy = wp0.y * w0 + wp1.y * w1 + wp2.y * w2;
                            let wz = wp0.z * w0 + wp1.z * w1 + wp2.z * w2;
                            !self.clipped(Vec3::new(wx, wy, wz))
                        } else {
                            true
                        };
                        if keep {
                            let idx_px = row + px as usize;
                            if z < self.zbuf[idx_px] {
                                self.zbuf[idx_px] = z;
                                let o = idx_px * 4;
                                if !smooth {
                                    self.fb[o] = flat_shaded[0];
                                    self.fb[o + 1] = flat_shaded[1];
                                    self.fb[o + 2] = flat_shaded[2];
                                    self.fb[o + 3] = 255;
                                } else {
                                    let nx = n0.x * w0 + n1.x * w1 + n2.x * w2;
                                    let ny = n0.y * w0 + n1.y * w1 + n2.y * w2;
                                    let nz = n0.z * w0 + n1.z * w1 + n2.z * w2;
                                    let inv_l = 1.0 / (nx * nx + ny * ny + nz * nz).sqrt().max(1e-6);
                                    let nnx = nx * inv_l;
                                    let nny = ny * inv_l;
                                    let nnz = nz * inv_l;
                                    let ndl = (nnx * key_light.x + nny * key_light.y + nnz * key_light.z).max(0.0);
                                    let hemi = 0.5 + 0.5 * nny;
                                    let (lum, spec) = if is_clay {
                                        (0.34 + 0.54 * ndl + 0.14 * hemi + sel_boost, 0.0)
                                    } else {
                                        let ndr = (nnx * rim_light.x + nny * rim_light.y + nnz * rim_light.z).max(0.0);
                                        let nh = (nnx * half_v.x + nny * half_v.y + nnz * half_v.z).max(0.0);
                                        let nh2 = nh * nh;
                                        let nh4 = nh2 * nh2;
                                        let nh16 = nh4 * nh4 * nh4 * nh4;
                                        (0.30 + 0.58 * ndl + 0.16 * ndr + 0.10 * hemi + sel_boost, nh16 * 64.0)
                                    };
                                    self.fb[o] = (cr * lum + spec).clamp(0.0, 255.0) as u8;
                                    self.fb[o + 1] = (cg * lum + spec).clamp(0.0, 255.0) as u8;
                                    self.fb[o + 2] = (cb * lum + spec).clamp(0.0, 255.0) as u8;
                                    self.fb[o + 3] = 255;
                                }
                            }
                        }
                    }
                    w0 += dw0_dx;
                    w1 += dw1_dx;
                    w2 += dw2_dx;
                    z += dz_dx;
                }
                w0_row += dw0_dy;
                w1_row += dw1_dy;
                w2_row += dw2_dy;
                z_row += dz_dy;
            }
        }

        if obj.flags != 0 {
            let ring_rgb = if (obj.flags & 2) != 0 {
                [255, 93, 122]
            } else {
                [14, 165, 233]
            };
            let r = 0.62 * obj.scale.x.max(obj.scale.y).max(obj.scale.z);
            let segs = 24;
            for i in 0..segs {
                let a0 = (i as f32 / segs as f32) * TAU;
                let a1 = ((i + 1) as f32 / segs as f32) * TAU;
                let p0 = obj
                    .pos
                    .add(self.cam_right.scale(a0.cos() * r))
                    .add(self.cam_up.scale(a0.sin() * r));
                let p1 = obj
                    .pos
                    .add(self.cam_right.scale(a1.cos() * r))
                    .add(self.cam_up.scale(a1.sin() * r));
                self.draw_line_3d(p0, p1, ring_rgb, true);
            }
        }
    }

    fn draw_cursor(&mut self) {
        if !self.show_cursor {
            return;
        }
        let p = self.cursor_pos;
        self.draw_line_3d(p, Vec3::new(p.x, -2.6, p.z), self.cursor_rgb, false);
        let segs = 20;
        let r = 0.24_f32;
        for i in 0..segs {
            let a0 = (i as f32 / segs as f32) * TAU;
            let a1 = ((i + 1) as f32 / segs as f32) * TAU;
            let p0 = p
                .add(self.cam_right.scale(a0.cos() * r))
                .add(self.cam_up.scale(a0.sin() * r));
            let p1 = p
                .add(self.cam_right.scale(a1.cos() * r))
                .add(self.cam_up.scale(a1.sin() * r));
            self.draw_line_3d(p0, p1, self.cursor_rgb, true);
        }
        if let Some((sx, sy, sz)) = self.project_cam(self.world_to_cam(p)) {
            let ix = sx as i32;
            let iy = sy as i32;
            for dy in -2..=2 {
                for dx in -2..=2 {
                    if dx * dx + dy * dy <= 5 {
                        self.put_px(ix + dx, iy + dy, sz - 0.05, self.cursor_rgb);
                    }
                }
            }
        }
    }

    fn draw_lines(&mut self, lines: &[SceneLine]) {
        for l in lines {
            if l.pts.len() < 2 {
                continue;
            }
            for i in 0..(l.pts.len() - 1) {
                self.draw_line_3d(l.pts[i], l.pts[i + 1], l.color, true);
            }
            if l.closed && l.pts.len() >= 3 {
                self.draw_line_3d(l.pts[l.pts.len() - 1], l.pts[0], l.color, true);
            }
            for &pt in &l.pts {
                if let Some((sx, sy, sz)) = self.project_cam(self.world_to_cam(pt)) {
                    let ix = sx as i32;
                    let iy = sy as i32;
                    for dy in -2..=2 {
                        for dx in -2..=2 {
                            if dx * dx + dy * dy <= 5 {
                                self.put_px(ix + dx, iy + dy, sz - 0.03, [255, 255, 255]);
                            }
                        }
                    }
                }
            }
        }
    }
}

pub struct Renderer {
    canvas: Canvas,
    detail: u8,
    meshes: [Option<Mesh>; 15],
    objs: Vec<SceneObj>,
    lines: Vec<SceneLine>,
}

impl Renderer {
    fn new() -> Self {
        Self {
            canvas: Canvas::new(),
            detail: 1,
            meshes: Default::default(),
            objs: Vec::with_capacity(64),
            lines: Vec::with_capacity(16),
        }
    }

    fn render(&mut self) {
        self.canvas.clear();
        self.canvas.draw_grid_and_bounds();
        // Ensure all referenced shape meshes are built before borrowing immutably
        for obj in &self.objs {
            let idx = (obj.shape_id as usize).min(14);
            if self.meshes[idx].is_none() {
                self.meshes[idx] = Some(build_shape_mesh(obj.shape_id, self.detail));
            }
        }
        // Zero-clone pass: borrow meshes, objs, and lines while mutating canvas
        for obj in &self.objs {
            let idx = (obj.shape_id as usize).min(14);
            if let Some(mesh) = self.meshes[idx].as_ref() {
                self.canvas.draw_mesh(obj, mesh);
            }
        }
        self.canvas.draw_lines(&self.lines);
        self.canvas.draw_cursor();
    }
}

/* ---------- global singleton + C ABI for WASM ---------- */

static mut STATE: Option<Renderer> = None;

fn state() -> &'static mut Renderer {
    unsafe { STATE.get_or_insert_with(Renderer::new) }
}

#[no_mangle]
pub extern "C" fn sw3d_resize(w: u32, h: u32) {
    state().canvas.resize(w as usize, h as usize);
}

#[no_mangle]
pub extern "C" fn sw3d_fb_ptr() -> *const u8 {
    state().canvas.fb.as_ptr()
}

#[no_mangle]
pub extern "C" fn sw3d_fb_len() -> u32 {
    state().canvas.fb.len() as u32
}

#[no_mangle]
pub extern "C" fn sw3d_set_camera(yaw: f32, pitch: f32, dist: f32) {
    let c = &mut state().canvas;
    c.cam_yaw = yaw;
    c.cam_pitch = pitch;
    c.cam_dist = dist.clamp(3.0, 18.0);
    c.update_camera();
}

#[no_mangle]
pub extern "C" fn sw3d_set_theme(bg: u32, grid_main: u32, grid_center: u32, bounds: u32) {
    let c = &mut state().canvas;
    c.bg_rgb = unpack_rgb(bg);
    c.grid_main_rgb = unpack_rgb(grid_main);
    c.grid_center_rgb = unpack_rgb(grid_center);
    c.bounds_rgb = unpack_rgb(bounds);
}

#[no_mangle]
pub extern "C" fn sw3d_set_flags(
    show_grid: u32,
    wireframe: u32,
    mat_mode: u32,
    detail: u32,
    clip_axis: u32,
    clip_pos: f32,
) {
    let s = state();
    s.canvas.show_grid = show_grid != 0;
    s.canvas.wireframe = wireframe != 0;
    s.canvas.mat_mode = (mat_mode as u8).min(2);
    let next_detail = (detail as u8).min(2);
    if next_detail != s.detail {
        s.detail = next_detail;
        s.meshes = Default::default();
    }
    s.canvas.clip_axis = (clip_axis as u8).min(3);
    s.canvas.clip_pos = clip_pos;
}

#[no_mangle]
pub extern "C" fn sw3d_begin_frame() {
    let s = state();
    s.objs.clear();
    s.lines.clear();
}

#[no_mangle]
pub extern "C" fn sw3d_push_object(
    shape_id: u32,
    x: f32,
    y: f32,
    z: f32,
    sx: f32,
    sy: f32,
    sz: f32,
    rot_y: f32,
    rot_x: f32,
    rgb: u32,
    flags: u32,
) {
    state().objs.push(SceneObj {
        shape_id: shape_id as u8,
        pos: Vec3::new(x, y, z),
        scale: Vec3::new(sx, sy, sz),
        rot_y,
        rot_x,
        color: unpack_rgb(rgb),
        flags: flags as u8,
    });
}

#[no_mangle]
pub extern "C" fn sw3d_begin_line(closed: u32, rgb: u32) {
    state().lines.push(SceneLine {
        pts: Vec::new(),
        closed: closed != 0,
        color: unpack_rgb(rgb),
    });
}

#[no_mangle]
pub extern "C" fn sw3d_push_line_pt(x: f32, y: f32, z: f32) {
    if let Some(l) = state().lines.last_mut() {
        l.pts.push(Vec3::new(x, y, z));
    }
}

#[no_mangle]
pub extern "C" fn sw3d_set_cursor(visible: u32, x: f32, y: f32, z: f32, rgb: u32) {
    let c = &mut state().canvas;
    c.show_cursor = visible != 0;
    c.cursor_pos = Vec3::new(x, y, z);
    c.cursor_rgb = unpack_rgb(rgb);
}

#[no_mangle]
pub extern "C" fn sw3d_render() {
    state().render();
}

#[no_mangle]
pub extern "C" fn sw3d_project(x: f32, y: f32, z: f32) -> u32 {
    let c = &mut state().canvas;
    match c.project_cam(c.world_to_cam(Vec3::new(x, y, z))) {
        Some((sx, sy, sz)) => {
            c.last_proj = [sx, sy, sz];
            1
        }
        None => 0,
    }
}

#[no_mangle]
pub extern "C" fn sw3d_proj_x() -> f32 {
    state().canvas.last_proj[0]
}

#[no_mangle]
pub extern "C" fn sw3d_proj_y() -> f32 {
    state().canvas.last_proj[1]
}

#[no_mangle]
pub extern "C" fn sw3d_proj_z() -> f32 {
    state().canvas.last_proj[2]
}

#[no_mangle]
pub extern "C" fn sw3d_unproject_z0(u: f32, v: f32) -> u32 {
    if state().canvas.unproject_z0(u, v) {
        1
    } else {
        0
    }
}

#[no_mangle]
pub extern "C" fn sw3d_unproj_x() -> f32 {
    state().canvas.last_unproj[0]
}

#[no_mangle]
pub extern "C" fn sw3d_unproj_y() -> f32 {
    state().canvas.last_unproj[1]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_all_15_shapes_with_valid_triangles() {
        for id in 0..15u8 {
            for detail in 0..=2u8 {
                let m = build_shape_mesh(id, detail);
                assert!(!m.verts.is_empty(), "shape {id} detail {detail} has no verts");
                assert!(!m.tris.is_empty(), "shape {id} detail {detail} has no tris");
                assert_eq!(m.verts.len(), m.norms.len());
                for tri in &m.tris {
                    for &idx in tri {
                        assert!((idx as usize) < m.verts.len());
                    }
                }
            }
        }
    }

    #[test]
    fn renders_cube_and_writes_zbuffer() {
        let mut r = Renderer::new();
        r.canvas.resize(160, 120);
        r.objs.push(SceneObj {
            shape_id: 0,
            pos: Vec3::new(0.0, 0.0, 0.0),
            scale: Vec3::new(1.5, 1.5, 1.5),
            rot_y: 0.4,
            rot_x: 0.2,
            color: [14, 165, 233],
            flags: 0,
        });
        r.render();
        let center = (60 * 160 + 80) as usize;
        assert!(r.canvas.zbuf[center].is_finite(), "center pixel should hit cube");
        assert_ne!(
            &r.canvas.fb[center * 4..center * 4 + 3],
            &r.canvas.bg_rgb,
            "center pixel should differ from background"
        );
    }

    #[test]
    fn clipping_plane_discards_clipped_half() {
        let mut r = Renderer::new();
        r.canvas.resize(160, 120);
        r.canvas.clip_axis = 2;
        r.canvas.clip_pos = -5.0;
        r.canvas.show_grid = false;
        r.canvas.show_cursor = false;
        r.objs.push(SceneObj {
            shape_id: 0,
            pos: Vec3::new(0.0, 0.0, 0.0),
            scale: Vec3::new(1.5, 1.5, 1.5),
            rot_y: 0.0,
            rot_x: 0.0,
            color: [255, 0, 0],
            flags: 0,
        });
        r.render();
        let center = (60 * 160 + 80) as usize;
        assert!(r.canvas.zbuf[center].is_infinite(), "clipped cube should not draw");
    }

    #[test]
    fn unproject_z0_roundtrips_center_and_offset() {
        let mut c = Canvas::new();
        c.resize(640, 360);
        c.cam_yaw = 0.45;
        c.cam_pitch = 0.3;
        c.update_camera();
        // Project a known point on z=0, then unproject back
        let pt = Vec3::new(1.2, -0.7, 0.0);
        let (sx, sy, _) = c.project_cam(c.world_to_cam(pt)).expect("visible");
        assert!(c.unproject_z0(sx / 640.0, sy / 360.0));
        assert!((c.last_unproj[0] - pt.x).abs() < 1e-3);
        assert!((c.last_unproj[1] - pt.y).abs() < 1e-3);
    }
}
