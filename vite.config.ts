/// <reference types="vitest" />
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';

const src=new URL('./src',import.meta.url).pathname;

/** Vendor chunks: three and the R3F stack load only with a mission route, charts only with /benchmark. */
function manualChunks(id:string):string|undefined{
 if(id.includes('node_modules/three/src/renderers/shaders/ShaderChunk/')||id.includes('node_modules/three/src/renderers/shaders/ShaderLib/'))return 'three-shaders';
 // The WebGL backend is only imported by WebGLRenderer itself, so it splits off the core without a cycle.
 // The barrel (Three.js) re-exports WebGLRenderer, so it travels with the backend (webgl → core only).
 if(/node_modules\/three\/src\/(Three\.js|renderers\/(WebGLRenderer\.js|webgl\/|webxr\/))/.test(id))return 'three-webgl';
 if(id.includes('node_modules/three/src/'))return 'three';
 if(id.includes('node_modules/three/')||id.includes('node_modules/three-stdlib/'))return 'three-addons';
 if(/node_modules\/(@react-three\/fiber|its-fine|suspend-react|react-reconciler|zustand\/.*traditional)/.test(id))return 'r3f';
 if(/node_modules\/(@react-three\/postprocessing|postprocessing|n8ao)\//.test(id))return 'r3f-postfx';
 if(/node_modules\/(@react-three\/drei|camera-controls|maath|three-mesh-bvh|troika-|webgl-sdf-generator|bidi-js|@monogrid|stats-gl|@react-spring|tunnel-rat|meshline|detect-gpu|hls\.js|@mediapipe)/.test(id))return 'r3f-drei';
 if(/node_modules\/(recharts|d3-|victory-vendor|recharts-scale|decimal\.js-light|internmap|lodash)/.test(id))return 'charts';
 if(/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run)\//.test(id))return 'react';
 if(/src\/(missions\/SearchRescueSim|platform\/WildernessEnvironment|core\/terrain)\b/.test(id))return 'rescue';
 if(/src\/(swarm|robot|physics|missions)\//.test(id))return 'simulation';
 return undefined;
}

export default defineConfig({
 plugins:[react()],
 resolve:{alias:[
  {find:/^three$/,replacement:new URL('./node_modules/three/src/Three.js',import.meta.url).pathname},
  {find:/^@\//,replacement:`${src}/`},
 ]},
 build:{target:'esnext',chunkSizeWarningLimit:500,rollupOptions:{output:{manualChunks}}},
 server:{host:true,port:5173},
 test:{setupFiles:['./tests/setup.ts'],css:false},
});
