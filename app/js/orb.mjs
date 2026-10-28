/* Seren 7 — the living orb: one WebGL fragment shader, an iridescent sphere
   with a slowly folding interior. Ported from the original interface
   (reference/Seren_7_original.html lines 540-680) with identical shader and
   motion constants; exported as an init(canvas) factory. */

export function initOrb(canvas) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const orbEl = (canvas.closest(".orb") || document.getElementById("orb"));
  const state = { energy: 0, target: 0, kick: 0, time: 8.0, light: 0, lightTarget: 0, running: false, last: 0 };
  let gl = null, prog = null, uRes, uTime, uEnergy, uLight;

  const VERT = "attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";
  const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform float uEnergy; uniform float uLight;
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 tis(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
  float n_=.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=tis(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
vec3 pal(float t){return vec3(.70,.62,.80)+vec3(.30,.30,.22)*cos(6.28318*(t+vec3(0.,.18,.42)));}
void main(){
  vec2 p=(gl_FragCoord.xy-.5*uRes)/(.5*min(uRes.x,uRes.y));
  p*=1.015;
  float r=length(p);
  float px=2.5/min(uRes.x,uRes.y);
  float mask=1.-smoothstep(1.-px*1.6,1.,r);
  if(mask<=0.){gl_FragColor=vec4(0.);return;}
  float z=sqrt(max(0.,1.-r*r));
  vec3 n=vec3(p,z);
  float t=uTime;
  float a=t*.12; float ca=cos(a), sa=sin(a);
  vec3 q=vec3(ca*n.x+sa*n.z,n.y,-sa*n.x+ca*n.z);
  float n1=snoise(q*1.25+vec3(0.,t*.33,t*.2));
  float n2=snoise(q*2.3+vec3(n1*1.2,-t*.24,t*.3));
  float n3=snoise(q*4.6+vec3(n2*.9,n1*.9,t*.5));
  float f=.55*n1+.3*n2+.15*n3;
  float fres=pow(1.-z,1.8);
  vec3 col=pal(f*.62+fres*.45+p.y*.18-p.x*.08+t*.03);
  float vein=smoothstep(0.,.09,abs(sin(f*7.+t*.6)));
  col=mix(col*1.3,col,vein);
  vec3 L=normalize(vec3(-.5,.6,.65));
  float diff=clamp(dot(n,L),0.,1.);
  col*=.55+.55*diff;
  col*=1.-.28*smoothstep(.2,1.,dot(p,vec2(.6,-.6)));
  col+=fres*pal(.3+t*.05+p.x*.3)*.55;
  vec3 H=normalize(L+vec3(0.,0.,1.));
  col+=vec3(1.)*pow(clamp(dot(n,H),0.,1.),64.)*.85;
  col+=vec3(1.)*.12*smoothstep(.45,0.,length(p-vec2(-.35,.42)));
  col*=1.+.24*uEnergy;
  float g=dot(col,vec3(.333));
  col=mix(vec3(g),col,1.+.4*uLight);
  col*=1.-.07*uLight;
  col=clamp(col,0.,1.);
  gl_FragColor=vec4(col*mask,mask);
}`;

  function compile(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function fallback() {
    gl = null; canvas.hidden = true;
    if (!canvas.parentNode.querySelector(".orb-fallback")) {
      const d = document.createElement("div"); d.className = "orb-fallback"; canvas.parentNode.appendChild(d);
    }
  }
  function init() {
    try {
      gl = canvas.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false, powerPreference: "low-power" });
      if (!gl) throw new Error("no webgl");
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, "a");
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      uRes = gl.getUniformLocation(prog, "uRes"); uTime = gl.getUniformLocation(prog, "uTime");
      uEnergy = gl.getUniformLocation(prog, "uEnergy"); uLight = gl.getUniformLocation(prog, "uLight");
      return true;
    } catch (err) { fallback(); return false; }
  }
  function resize() {
    if (!gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(canvas.clientWidth * dpr) || 300;
    if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  function frame(now) {
    if (!state.running) return;
    const dt = Math.min(0.05, (now - (state.last || now)) / 1000); state.last = now;
    state.kick *= 0.92;
    state.energy += (Math.min(1, state.target + state.kick) - state.energy) * 0.05;
    state.light += (state.lightTarget - state.light) * 0.08;
    const speed = reduce.matches ? 0 : 0.22 + state.energy * 1.1;
    state.time += dt * speed;
    if (gl) {
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, state.time); gl.uniform1f(uEnergy, state.energy); gl.uniform1f(uLight, state.light);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    requestAnimationFrame(frame);
  }
  function start() { if (state.running) return; state.running = true; state.last = 0; requestAnimationFrame(frame); }
  function stop() { state.running = false; }

  canvas.addEventListener("webglcontextlost", e => { e.preventDefault(); fallback(); });
  canvas.addEventListener("webglcontextrestored", () => {
    canvas.hidden = false;
    canvas.parentNode.querySelector(".orb-fallback")?.remove();
    init(); resize();
  });
  init(); resize();
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => document.hidden ? stop() : start());
  start();

  return {
    setEnergy(v) { state.target = v; orbEl.dataset.energy = v > 0.5 ? "high" : "low"; },
    kick(v) { state.kick = Math.min(1, state.kick + v); },
    setLight(isLight) { state.lightTarget = isLight ? 1 : 0; },
    resize
  };
}
