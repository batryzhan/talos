import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],resolve:{alias:[{find:/^three$/,replacement:new URL('./node_modules/three/src/Three.js',import.meta.url).pathname}]},build:{target:'esnext',rollupOptions:{output:{manualChunks(id){
 if(id.includes('node_modules/three/src/renderers/shaders/ShaderChunk/')||id.includes('node_modules/three/src/renderers/shaders/ShaderLib/'))return 'three-shaders';
 if(id.includes('node_modules/three/src/'))return 'three';
 if(id.includes('node_modules/three/'))return 'three-addons';
 if(/node_modules\/(react|react-dom|scheduler)\//.test(id))return 'react';
 if(/src\/(swarm|robot|physics|missions)\//.test(id))return 'simulation';
 }}}},server:{host:true,port:5173}});
