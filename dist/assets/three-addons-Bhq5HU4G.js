import"./three-webgl-DWS2Exbn.js";import{ag as _n,ah as bt,fw as wr,fu as Gt,fv as yn,e5 as _r,e6 as pt,dg as xn,el as Oe,t as Xt,C as $e,a9 as Pe,c3 as vt,fb as yr,eA as xr,d5 as br,e as gt,$ as Te,dD as Rr,eL as bn,dA as Ir,eu as Rn,fp as Mr,dv as Lr,dH as Ur,aX as In,a_ as Nr,aY as Cr,a$ as Dr,aZ as Je,ak as Mn,aW as zt,aU as Or,aV as Br,eD as Fr,ec as Ut,dY as Hr,em as Ln,a5 as Un,eg as dt,eH as kr,f4 as Pr,M as qt,e1 as Gr,dW as zr,e0 as Kr,eC as jr,bZ as Nt,b$ as Zr,ee as Nn,ex as Wr,f2 as Vr,cd as Xr,cu as qr,dK as Yr,dL as Cn,dI as Ye,T as on,fD as an,et as cn,eM as ln,f as un,F as Qr,dJ as $r,cx as Mt,f6 as Yt,c4 as Jr,du as es,S as Dn,c$ as On,H as Ze,i as nt,d0 as tt,R as ts,bo as ns,dB as rs,di as fn,dC as Kt,fJ as ss,c as Rt,a4 as Bn,ab as It,V as At,dX as is}from"./three-Bimg7SuF.js";function oi(d,e=!1){const t=d[0].index!==null,s=new Set(Object.keys(d[0].attributes)),r=new Set(Object.keys(d[0].morphAttributes)),o={},i={},l=d[0].morphTargetsRelative,c=new _n;let u=0;for(let h=0;h<d.length;++h){const p=d[h];let v=0;if(t!==(p.index!==null))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+". All geometries must have compatible attributes; make sure index attribute exists among all geometries, or in none of them."),null;for(const T in p.attributes){if(!s.has(T))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+'. All geometries must have compatible attributes; make sure "'+T+'" attribute exists among all geometries, or in none of them.'),null;o[T]===void 0&&(o[T]=[]),o[T].push(p.attributes[T]),v++}if(v!==s.size)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+". Make sure all geometries have the same number of attributes."),null;if(l!==p.morphTargetsRelative)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+". .morphTargetsRelative must be consistent throughout all geometries."),null;for(const T in p.morphAttributes){if(!r.has(T))return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+".  .morphAttributes must be consistent throughout all geometries."),null;i[T]===void 0&&(i[T]=[]),i[T].push(p.morphAttributes[T])}if(e){let T;if(t)T=p.index.count;else if(p.attributes.position!==void 0)T=p.attributes.position.count;else return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed with geometry at index "+h+". The geometry must have either an index or a position attribute"),null;c.addGroup(u,T,h),u+=T}}if(t){let h=0;const p=[];for(let v=0;v<d.length;++v){const T=d[v].index;for(let I=0;I<T.count;++I)p.push(T.getX(I)+h);h+=d[v].attributes.position.count}c.setIndex(p)}for(const h in o){const p=hn(o[h]);if(!p)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the "+h+" attribute."),null;c.setAttribute(h,p)}for(const h in i){const p=i[h][0].length;if(p===0)break;c.morphAttributes=c.morphAttributes||{},c.morphAttributes[h]=[];for(let v=0;v<p;++v){const T=[];for(let C=0;C<i[h].length;++C)T.push(i[h][C][v]);const I=hn(T);if(!I)return console.error("THREE.BufferGeometryUtils: .mergeGeometries() failed while trying to merge the "+h+" morphAttribute."),null;c.morphAttributes[h].push(I)}}return c}function hn(d){let e,t,s,r=-1,o=0;for(let u=0;u<d.length;++u){const h=d[u];if(e===void 0&&(e=h.array.constructor),e!==h.array.constructor)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.array must be of consistent array types across matching attributes."),null;if(t===void 0&&(t=h.itemSize),t!==h.itemSize)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.itemSize must be consistent across matching attributes."),null;if(s===void 0&&(s=h.normalized),s!==h.normalized)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.normalized must be consistent across matching attributes."),null;if(r===-1&&(r=h.gpuType),r!==h.gpuType)return console.error("THREE.BufferGeometryUtils: .mergeAttributes() failed. BufferAttribute.gpuType must be consistent across matching attributes."),null;o+=h.count*t}const i=new e(o),l=new bt(i,t,s);let c=0;for(let u=0;u<d.length;++u){const h=d[u];if(h.isInterleavedBufferAttribute){const p=c/t;for(let v=0,T=h.count;v<T;v++)for(let I=0;I<t;I++){const C=h.getComponent(v,I);l.setComponent(v+p,I,C)}}else i.set(h.array,c);c+=h.count*t}return r!==void 0&&(l.gpuType=r),l}function dn(d,e){if(e===wr)return console.warn("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles."),d;if(e===Gt||e===yn){let t=d.getIndex();if(t===null){const i=[],l=d.getAttribute("position");if(l!==void 0){for(let c=0;c<l.count;c++)i.push(c);d.setIndex(i),t=d.getIndex()}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible."),d}const s=t.count-2,r=[];if(e===Gt)for(let i=1;i<=s;i++)r.push(t.getX(0)),r.push(t.getX(i)),r.push(t.getX(i+1));else for(let i=0;i<s;i++)i%2===0?(r.push(t.getX(i)),r.push(t.getX(i+1)),r.push(t.getX(i+2))):(r.push(t.getX(i+2)),r.push(t.getX(i+1)),r.push(t.getX(i)));r.length/3!==s&&console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.");const o=d.clone();return o.setIndex(r),o.clearGroups(),o}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:",e),d}class ai extends _r{constructor(e){super(e),this.dracoLoader=null,this.ktx2Loader=null,this.meshoptDecoder=null,this.pluginCallbacks=[],this.register(function(t){return new us(t)}),this.register(function(t){return new fs(t)}),this.register(function(t){return new Es(t)}),this.register(function(t){return new Ss(t)}),this.register(function(t){return new ws(t)}),this.register(function(t){return new ds(t)}),this.register(function(t){return new ps(t)}),this.register(function(t){return new ms(t)}),this.register(function(t){return new vs(t)}),this.register(function(t){return new ls(t)}),this.register(function(t){return new gs(t)}),this.register(function(t){return new hs(t)}),this.register(function(t){return new Ts(t)}),this.register(function(t){return new As(t)}),this.register(function(t){return new as(t)}),this.register(function(t){return new _s(t)}),this.register(function(t){return new ys(t)})}load(e,t,s,r){const o=this;let i;if(this.resourcePath!=="")i=this.resourcePath;else if(this.path!==""){const u=pt.extractUrlBase(e);i=pt.resolveURL(u,this.path)}else i=pt.extractUrlBase(e);this.manager.itemStart(e);const l=function(u){r?r(u):console.error(u),o.manager.itemError(e),o.manager.itemEnd(e)},c=new xn(this.manager);c.setPath(this.path),c.setResponseType("arraybuffer"),c.setRequestHeader(this.requestHeader),c.setWithCredentials(this.withCredentials),c.load(e,function(u){try{o.parse(u,i,function(h){t(h),o.manager.itemEnd(e)},l)}catch(h){l(h)}},s,l)}setDRACOLoader(e){return this.dracoLoader=e,this}setKTX2Loader(e){return this.ktx2Loader=e,this}setMeshoptDecoder(e){return this.meshoptDecoder=e,this}register(e){return this.pluginCallbacks.indexOf(e)===-1&&this.pluginCallbacks.push(e),this}unregister(e){return this.pluginCallbacks.indexOf(e)!==-1&&this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(e),1),this}parse(e,t,s,r){let o;const i={},l={},c=new TextDecoder;if(typeof e=="string")o=JSON.parse(e);else if(e instanceof ArrayBuffer)if(c.decode(new Uint8Array(e,0,4))===Fn){try{i[P.KHR_BINARY_GLTF]=new xs(e)}catch(p){r&&r(p);return}o=JSON.parse(i[P.KHR_BINARY_GLTF].content)}else o=JSON.parse(c.decode(e));else o=e;if(o.asset===void 0||o.asset.version[0]<2){r&&r(new Error("THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported."));return}const u=new Hs(o,{path:t||this.resourcePath||"",crossOrigin:this.crossOrigin,requestHeader:this.requestHeader,manager:this.manager,ktx2Loader:this.ktx2Loader,meshoptDecoder:this.meshoptDecoder});u.fileLoader.setRequestHeader(this.requestHeader);for(let h=0;h<this.pluginCallbacks.length;h++){const p=this.pluginCallbacks[h](u);p.name||console.error("THREE.GLTFLoader: Invalid plugin found: missing name"),l[p.name]=p,i[p.name]=!0}if(o.extensionsUsed)for(let h=0;h<o.extensionsUsed.length;++h){const p=o.extensionsUsed[h],v=o.extensionsRequired||[];switch(p){case P.KHR_MATERIALS_UNLIT:i[p]=new cs;break;case P.KHR_DRACO_MESH_COMPRESSION:i[p]=new bs(o,this.dracoLoader);break;case P.KHR_TEXTURE_TRANSFORM:i[p]=new Rs;break;case P.KHR_MESH_QUANTIZATION:i[p]=new Is;break;default:v.indexOf(p)>=0&&l[p]===void 0&&console.warn('THREE.GLTFLoader: Unknown extension "'+p+'".')}}u.setExtensions(i),u.setPlugins(l),u.parse(s,r)}parseAsync(e,t){const s=this;return new Promise(function(r,o){s.parse(e,t,r,o)})}}function os(){let d={};return{get:function(e){return d[e]},add:function(e,t){d[e]=t},remove:function(e){delete d[e]},removeAll:function(){d={}}}}const P={KHR_BINARY_GLTF:"KHR_binary_glTF",KHR_DRACO_MESH_COMPRESSION:"KHR_draco_mesh_compression",KHR_LIGHTS_PUNCTUAL:"KHR_lights_punctual",KHR_MATERIALS_CLEARCOAT:"KHR_materials_clearcoat",KHR_MATERIALS_DISPERSION:"KHR_materials_dispersion",KHR_MATERIALS_IOR:"KHR_materials_ior",KHR_MATERIALS_SHEEN:"KHR_materials_sheen",KHR_MATERIALS_SPECULAR:"KHR_materials_specular",KHR_MATERIALS_TRANSMISSION:"KHR_materials_transmission",KHR_MATERIALS_IRIDESCENCE:"KHR_materials_iridescence",KHR_MATERIALS_ANISOTROPY:"KHR_materials_anisotropy",KHR_MATERIALS_UNLIT:"KHR_materials_unlit",KHR_MATERIALS_VOLUME:"KHR_materials_volume",KHR_TEXTURE_BASISU:"KHR_texture_basisu",KHR_TEXTURE_TRANSFORM:"KHR_texture_transform",KHR_MESH_QUANTIZATION:"KHR_mesh_quantization",KHR_MATERIALS_EMISSIVE_STRENGTH:"KHR_materials_emissive_strength",EXT_MATERIALS_BUMP:"EXT_materials_bump",EXT_TEXTURE_WEBP:"EXT_texture_webp",EXT_TEXTURE_AVIF:"EXT_texture_avif",EXT_MESHOPT_COMPRESSION:"EXT_meshopt_compression",EXT_MESH_GPU_INSTANCING:"EXT_mesh_gpu_instancing"};class as{constructor(e){this.parser=e,this.name=P.KHR_LIGHTS_PUNCTUAL,this.cache={refs:{},uses:{}}}_markDefs(){const e=this.parser,t=this.parser.json.nodes||[];for(let s=0,r=t.length;s<r;s++){const o=t[s];o.extensions&&o.extensions[this.name]&&o.extensions[this.name].light!==void 0&&e._addNodeRef(this.cache,o.extensions[this.name].light)}}_loadLight(e){const t=this.parser,s="light:"+e;let r=t.cache.get(s);if(r)return r;const o=t.json,c=((o.extensions&&o.extensions[this.name]||{}).lights||[])[e];let u;const h=new $e(16777215);c.color!==void 0&&h.setRGB(c.color[0],c.color[1],c.color[2],Pe);const p=c.range!==void 0?c.range:0;switch(c.type){case"directional":u=new br(h),u.target.position.set(0,0,-1),u.add(u.target);break;case"point":u=new xr(h),u.distance=p;break;case"spot":u=new yr(h),u.distance=p,c.spot=c.spot||{},c.spot.innerConeAngle=c.spot.innerConeAngle!==void 0?c.spot.innerConeAngle:0,c.spot.outerConeAngle=c.spot.outerConeAngle!==void 0?c.spot.outerConeAngle:Math.PI/4,u.angle=c.spot.outerConeAngle,u.penumbra=1-c.spot.innerConeAngle/c.spot.outerConeAngle,u.target.position.set(0,0,-1),u.add(u.target);break;default:throw new Error("THREE.GLTFLoader: Unexpected light type: "+c.type)}return u.position.set(0,0,0),u.decay=2,ke(u,c),c.intensity!==void 0&&(u.intensity=c.intensity),u.name=t.createUniqueName(c.name||"light_"+e),r=Promise.resolve(u),t.cache.add(s,r),r}getDependency(e,t){if(e==="light")return this._loadLight(t)}createNodeAttachment(e){const t=this,s=this.parser,o=s.json.nodes[e],l=(o.extensions&&o.extensions[this.name]||{}).light;return l===void 0?null:this._loadLight(l).then(function(c){return s._getNodeRef(t.cache,l,c)})}}class cs{constructor(){this.name=P.KHR_MATERIALS_UNLIT}getMaterialType(){return dt}extendParams(e,t,s){const r=[];e.color=new $e(1,1,1),e.opacity=1;const o=t.pbrMetallicRoughness;if(o){if(Array.isArray(o.baseColorFactor)){const i=o.baseColorFactor;e.color.setRGB(i[0],i[1],i[2],Pe),e.opacity=i[3]}o.baseColorTexture!==void 0&&r.push(s.assignTexture(e,"map",o.baseColorTexture,vt))}return Promise.all(r)}}class ls{constructor(e){this.parser=e,this.name=P.KHR_MATERIALS_EMISSIVE_STRENGTH}extendMaterialParams(e,t){const r=this.parser.json.materials[e];if(!r.extensions||!r.extensions[this.name])return Promise.resolve();const o=r.extensions[this.name].emissiveStrength;return o!==void 0&&(t.emissiveIntensity=o),Promise.resolve()}}class us{constructor(e){this.parser=e,this.name=P.KHR_MATERIALS_CLEARCOAT}getMaterialType(e){const s=this.parser.json.materials[e];return!s.extensions||!s.extensions[this.name]?null:Oe}extendMaterialParams(e,t){const s=this.parser,r=s.json.materials[e];if(!r.extensions||!r.extensions[this.name])return Promise.resolve();const o=[],i=r.extensions[this.name];if(i.clearcoatFactor!==void 0&&(t.clearcoat=i.clearcoatFactor),i.clearcoatTexture!==void 0&&o.push(s.assignTexture(t,"clearcoatMap",i.clearcoatTexture)),i.clearcoatRoughnessFactor!==void 0&&(t.clearcoatRoughness=i.clearcoatRoughnessFactor),i.clearcoatRoughnessTexture!==void 0&&o.push(s.assignTexture(t,"clearcoatRoughnessMap",i.clearcoatRoughnessTexture)),i.clearcoatNormalTexture!==void 0&&(o.push(s.assignTexture(t,"clearcoatNormalMap",i.clearcoatNormalTexture)),i.clearcoatNormalTexture.scale!==void 0)){const l=i.clearcoatNormalTexture.scale;t.clearcoatNormalScale=new Xt(l,l)}return Promise.all(o)}}class fs{constructor(e){this.parser=e,this.name=P.KHR_MATERIALS_DISPERSION}getMaterialType(e){const s=this.parser.json.materials[e];return!s.extensions||!s.extensions[this.name]?null:Oe}extendMaterialParams(e,t){const r=this.parser.json.materials[e];if(!r.extensions||!r.extensions[this.name])return Promise.resolve();const o=r.extensions[this.name];return t.dispersion=o.dispersion!==void 0?o.dispersion:0,Promise.resolve()}}class hs{constructor(e){this.parser=e,this.name=P.KHR_MATERIALS_IRIDESCENCE}getMaterialType(e){const s=this.parser.json.materials[e];return!s.extensions||!s.extensions[this.name]?null:Oe}extendMaterialParams(e,t){const s=this.parser,r=s.json.materials[e];if(!r.extensions||!r.extensions[this.name])return Promise.resolve();const o=[],i=r.extensions[this.name];return i.iridescenceFactor!==void 0&&(t.iridescence=i.iridescenceFactor),i.iridescenceTexture!==void 0&&o.push(s.assignTexture(t,"iridescenceMap",i.iridescenceTexture)),i.iridescenceIor!==void 0&&(t.iridescenceIOR=i.iridescenceIor),t.iridescenceThicknessRange===void 0&&(t.iridescenceThicknessRange=[100,400]),i.iridescenceThicknessMinimum!==void 0&&(t.iridescenceThicknessRange[0]=i.iridescenceThicknessMinimum),i.iridescenceThicknessMaximum!==void 0&&(t.iridescenceThicknessRange[1]=i.iridescenceThicknessMaximum),i.iridescenceThicknessTexture!==void 0&&o.push(s.assignTexture(t,"iridescenceThicknessMap",i.iridescenceThicknessTexture)),Promise.all(o)}}class ds{constructor(e){this.parser=e,this.name=P.KHR_MATERIALS_SHEEN}getMaterialType(e){const s=this.parser.json.materials[e];return!s.extensions||!s.extensions[this.name]?null:Oe}extendMaterialParams(e,t){const s=this.parser,r=s.json.materials[e];if(!r.extensions||!r.extensions[this.name])return Promise.resolve();const o=[];t.sheenColor=new $e(0,0,0),t.sheenRoughness=0,t.sheen=1;const i=r.extensions[this.name];if(i.sheenColorFactor!==void 0){const l=i.sheenColorFactor;t.sheenColor.setRGB(l[0],l[1],l[2],Pe)}return i.sheenRoughnessFactor!==void 0&&(t.sheenRoughness=i.sheenRoughnessFactor),i.sheenColorTexture!==void 0&&o.push(s.assignTexture(t,"sheenColorMap",i.sheenColorTexture,vt)),i.sheenRoughnessTexture!==void 0&&o.push(s.assignTexture(t,"sheenRoughnessMap",i.sheenRoughnessTexture)),Promise.all(o)}}class ps{constructor(e){this.parser=e,this.name=P.KHR_MATERIALS_TRANSMISSION}getMaterialType(e){const s=this.parser.json.materials[e];return!s.extensions||!s.extensions[this.name]?null:Oe}extendMaterialParams(e,t){const s=this.parser,r=s.json.materials[e];if(!r.extensions||!r.extensions[this.name])return Promise.resolve();const o=[],i=r.extensions[this.name];return i.transmissionFactor!==void 0&&(t.transmission=i.transmissionFactor),i.transmissionTexture!==void 0&&o.push(s.assignTexture(t,"transmissionMap",i.transmissionTexture)),Promise.all(o)}}class ms{constructor(e){this.parser=e,this.name=P.KHR_MATERIALS_VOLUME}getMaterialType(e){const s=this.parser.json.materials[e];return!s.extensions||!s.extensions[this.name]?null:Oe}extendMaterialParams(e,t){const s=this.parser,r=s.json.materials[e];if(!r.extensions||!r.extensions[this.name])return Promise.resolve();const o=[],i=r.extensions[this.name];t.thickness=i.thicknessFactor!==void 0?i.thicknessFactor:0,i.thicknessTexture!==void 0&&o.push(s.assignTexture(t,"thicknessMap",i.thicknessTexture)),t.attenuationDistance=i.attenuationDistance||1/0;const l=i.attenuationColor||[1,1,1];return t.attenuationColor=new $e().setRGB(l[0],l[1],l[2],Pe),Promise.all(o)}}class vs{constructor(e){this.parser=e,this.name=P.KHR_MATERIALS_IOR}getMaterialType(e){const s=this.parser.json.materials[e];return!s.extensions||!s.extensions[this.name]?null:Oe}extendMaterialParams(e,t){const r=this.parser.json.materials[e];if(!r.extensions||!r.extensions[this.name])return Promise.resolve();const o=r.extensions[this.name];return t.ior=o.ior!==void 0?o.ior:1.5,Promise.resolve()}}class gs{constructor(e){this.parser=e,this.name=P.KHR_MATERIALS_SPECULAR}getMaterialType(e){const s=this.parser.json.materials[e];return!s.extensions||!s.extensions[this.name]?null:Oe}extendMaterialParams(e,t){const s=this.parser,r=s.json.materials[e];if(!r.extensions||!r.extensions[this.name])return Promise.resolve();const o=[],i=r.extensions[this.name];t.specularIntensity=i.specularFactor!==void 0?i.specularFactor:1,i.specularTexture!==void 0&&o.push(s.assignTexture(t,"specularIntensityMap",i.specularTexture));const l=i.specularColorFactor||[1,1,1];return t.specularColor=new $e().setRGB(l[0],l[1],l[2],Pe),i.specularColorTexture!==void 0&&o.push(s.assignTexture(t,"specularColorMap",i.specularColorTexture,vt)),Promise.all(o)}}class As{constructor(e){this.parser=e,this.name=P.EXT_MATERIALS_BUMP}getMaterialType(e){const s=this.parser.json.materials[e];return!s.extensions||!s.extensions[this.name]?null:Oe}extendMaterialParams(e,t){const s=this.parser,r=s.json.materials[e];if(!r.extensions||!r.extensions[this.name])return Promise.resolve();const o=[],i=r.extensions[this.name];return t.bumpScale=i.bumpFactor!==void 0?i.bumpFactor:1,i.bumpTexture!==void 0&&o.push(s.assignTexture(t,"bumpMap",i.bumpTexture)),Promise.all(o)}}class Ts{constructor(e){this.parser=e,this.name=P.KHR_MATERIALS_ANISOTROPY}getMaterialType(e){const s=this.parser.json.materials[e];return!s.extensions||!s.extensions[this.name]?null:Oe}extendMaterialParams(e,t){const s=this.parser,r=s.json.materials[e];if(!r.extensions||!r.extensions[this.name])return Promise.resolve();const o=[],i=r.extensions[this.name];return i.anisotropyStrength!==void 0&&(t.anisotropy=i.anisotropyStrength),i.anisotropyRotation!==void 0&&(t.anisotropyRotation=i.anisotropyRotation),i.anisotropyTexture!==void 0&&o.push(s.assignTexture(t,"anisotropyMap",i.anisotropyTexture)),Promise.all(o)}}class Es{constructor(e){this.parser=e,this.name=P.KHR_TEXTURE_BASISU}loadTexture(e){const t=this.parser,s=t.json,r=s.textures[e];if(!r.extensions||!r.extensions[this.name])return null;const o=r.extensions[this.name],i=t.options.ktx2Loader;if(!i){if(s.extensionsRequired&&s.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures");return null}return t.loadTextureImage(e,o.source,i)}}class Ss{constructor(e){this.parser=e,this.name=P.EXT_TEXTURE_WEBP,this.isSupported=null}loadTexture(e){const t=this.name,s=this.parser,r=s.json,o=r.textures[e];if(!o.extensions||!o.extensions[t])return null;const i=o.extensions[t],l=r.images[i.source];let c=s.textureLoader;if(l.uri){const u=s.options.manager.getHandler(l.uri);u!==null&&(c=u)}return this.detectSupport().then(function(u){if(u)return s.loadTextureImage(e,i.source,c);if(r.extensionsRequired&&r.extensionsRequired.indexOf(t)>=0)throw new Error("THREE.GLTFLoader: WebP required by asset but unsupported.");return s.loadTexture(e)})}detectSupport(){return this.isSupported||(this.isSupported=new Promise(function(e){const t=new Image;t.src="data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",t.onload=t.onerror=function(){e(t.height===1)}})),this.isSupported}}class ws{constructor(e){this.parser=e,this.name=P.EXT_TEXTURE_AVIF,this.isSupported=null}loadTexture(e){const t=this.name,s=this.parser,r=s.json,o=r.textures[e];if(!o.extensions||!o.extensions[t])return null;const i=o.extensions[t],l=r.images[i.source];let c=s.textureLoader;if(l.uri){const u=s.options.manager.getHandler(l.uri);u!==null&&(c=u)}return this.detectSupport().then(function(u){if(u)return s.loadTextureImage(e,i.source,c);if(r.extensionsRequired&&r.extensionsRequired.indexOf(t)>=0)throw new Error("THREE.GLTFLoader: AVIF required by asset but unsupported.");return s.loadTexture(e)})}detectSupport(){return this.isSupported||(this.isSupported=new Promise(function(e){const t=new Image;t.src="data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAABcAAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAAB9tZGF0EgAKCBgABogQEDQgMgkQAAAAB8dSLfI=",t.onload=t.onerror=function(){e(t.height===1)}})),this.isSupported}}class _s{constructor(e){this.name=P.EXT_MESHOPT_COMPRESSION,this.parser=e}loadBufferView(e){const t=this.parser.json,s=t.bufferViews[e];if(s.extensions&&s.extensions[this.name]){const r=s.extensions[this.name],o=this.parser.getDependency("buffer",r.buffer),i=this.parser.options.meshoptDecoder;if(!i||!i.supported){if(t.extensionsRequired&&t.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files");return null}return o.then(function(l){const c=r.byteOffset||0,u=r.byteLength||0,h=r.count,p=r.byteStride,v=new Uint8Array(l,c,u);return i.decodeGltfBufferAsync?i.decodeGltfBufferAsync(h,p,v,r.mode,r.filter).then(function(T){return T.buffer}):i.ready.then(function(){const T=new ArrayBuffer(h*p);return i.decodeGltfBuffer(new Uint8Array(T),h,p,v,r.mode,r.filter),T})})}else return null}}class ys{constructor(e){this.name=P.EXT_MESH_GPU_INSTANCING,this.parser=e}createNodeMesh(e){const t=this.parser.json,s=t.nodes[e];if(!s.extensions||!s.extensions[this.name]||s.mesh===void 0)return null;const r=t.meshes[s.mesh];for(const u of r.primitives)if(u.mode!==xe.TRIANGLES&&u.mode!==xe.TRIANGLE_STRIP&&u.mode!==xe.TRIANGLE_FAN&&u.mode!==void 0)return null;const i=s.extensions[this.name].attributes,l=[],c={};for(const u in i)l.push(this.parser.getDependency("accessor",i[u]).then(h=>(c[u]=h,c[u])));return l.length<1?null:(l.push(this.parser.createNodeMesh(e)),Promise.all(l).then(u=>{const h=u.pop(),p=h.isGroup?h.children:[h],v=u[0].count,T=[];for(const I of p){const C=new gt,R=new Te,N=new bn,G=new Te(1,1,1),Z=new Rr(I.geometry,I.material,v);for(let D=0;D<v;D++)c.TRANSLATION&&R.fromBufferAttribute(c.TRANSLATION,D),c.ROTATION&&N.fromBufferAttribute(c.ROTATION,D),c.SCALE&&G.fromBufferAttribute(c.SCALE,D),Z.setMatrixAt(D,C.compose(R,N,G));for(const D in c)if(D==="_COLOR_0"){const ue=c[D];Z.instanceColor=new Ir(ue.array,ue.itemSize,ue.normalized)}else D!=="TRANSLATION"&&D!=="ROTATION"&&D!=="SCALE"&&I.geometry.setAttribute(D,c[D]);Rn.prototype.copy.call(Z,I),this.parser.assignFinalMaterial(Z),T.push(Z)}return h.isGroup?(h.clear(),h.add(...T),h):T[0]}))}}const Fn="glTF",ut=12,pn={JSON:1313821514,BIN:5130562};class xs{constructor(e){this.name=P.KHR_BINARY_GLTF,this.content=null,this.body=null;const t=new DataView(e,0,ut),s=new TextDecoder;if(this.header={magic:s.decode(new Uint8Array(e.slice(0,4))),version:t.getUint32(4,!0),length:t.getUint32(8,!0)},this.header.magic!==Fn)throw new Error("THREE.GLTFLoader: Unsupported glTF-Binary header.");if(this.header.version<2)throw new Error("THREE.GLTFLoader: Legacy binary file detected.");const r=this.header.length-ut,o=new DataView(e,ut);let i=0;for(;i<r;){const l=o.getUint32(i,!0);i+=4;const c=o.getUint32(i,!0);if(i+=4,c===pn.JSON){const u=new Uint8Array(e,ut+i,l);this.content=s.decode(u)}else if(c===pn.BIN){const u=ut+i;this.body=e.slice(u,u+l)}i+=l}if(this.content===null)throw new Error("THREE.GLTFLoader: JSON content not found.")}}class bs{constructor(e,t){if(!t)throw new Error("THREE.GLTFLoader: No DRACOLoader instance provided.");this.name=P.KHR_DRACO_MESH_COMPRESSION,this.json=e,this.dracoLoader=t,this.dracoLoader.preload()}decodePrimitive(e,t){const s=this.json,r=this.dracoLoader,o=e.extensions[this.name].bufferView,i=e.extensions[this.name].attributes,l={},c={},u={};for(const h in i){const p=jt[h]||h.toLowerCase();l[p]=i[h]}for(const h in e.attributes){const p=jt[h]||h.toLowerCase();if(i[h]!==void 0){const v=s.accessors[e.attributes[h]],T=rt[v.componentType];u[p]=T.name,c[p]=v.normalized===!0}}return t.getDependency("bufferView",o).then(function(h){return new Promise(function(p,v){r.decodeDracoFile(h,function(T){for(const I in T.attributes){const C=T.attributes[I],R=c[I];R!==void 0&&(C.normalized=R)}p(T)},l,u,Pe,v)})})}}class Rs{constructor(){this.name=P.KHR_TEXTURE_TRANSFORM}extendTexture(e,t){return(t.texCoord===void 0||t.texCoord===e.channel)&&t.offset===void 0&&t.rotation===void 0&&t.scale===void 0||(e=e.clone(),t.texCoord!==void 0&&(e.channel=t.texCoord),t.offset!==void 0&&e.offset.fromArray(t.offset),t.rotation!==void 0&&(e.rotation=t.rotation),t.scale!==void 0&&e.repeat.fromArray(t.scale),e.needsUpdate=!0),e}}class Is{constructor(){this.name=P.KHR_MESH_QUANTIZATION}}class Hn extends $r{constructor(e,t,s,r){super(e,t,s,r)}copySampleValue_(e){const t=this.resultBuffer,s=this.sampleValues,r=this.valueSize,o=e*r*3+r;for(let i=0;i!==r;i++)t[i]=s[o+i];return t}interpolate_(e,t,s,r){const o=this.resultBuffer,i=this.sampleValues,l=this.valueSize,c=l*2,u=l*3,h=r-t,p=(s-t)/h,v=p*p,T=v*p,I=e*u,C=I-u,R=-2*T+3*v,N=T-v,G=1-R,Z=N-v+p;for(let D=0;D!==l;D++){const ue=i[C+D+l],ce=i[C+D+c]*h,oe=i[I+D+l],M=i[I+D]*h;o[D]=G*ue+Z*ce+R*oe+N*M}return o}}const Ms=new bn;class Ls extends Hn{interpolate_(e,t,s,r){const o=super.interpolate_(e,t,s,r);return Ms.fromArray(o).normalize().toArray(o),o}}const xe={POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6},rt={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},mn={9728:Mn,9729:Je,9984:Dr,9985:Cr,9986:Nr,9987:In},vn={33071:Br,33648:Or,10497:zt},Ct={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},jt={POSITION:"position",NORMAL:"normal",TANGENT:"tangent",TEXCOORD_0:"uv",TEXCOORD_1:"uv1",TEXCOORD_2:"uv2",TEXCOORD_3:"uv3",COLOR_0:"color",WEIGHTS_0:"skinWeight",JOINTS_0:"skinIndex"},Ke={scale:"scale",translation:"position",rotation:"quaternion",weights:"morphTargetInfluences"},Us={CUBICSPLINE:void 0,LINEAR:Cn,STEP:Yr},Dt={OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"};function Ns(d){return d.DefaultMaterial===void 0&&(d.DefaultMaterial=new Ln({color:16777215,emissive:0,metalness:1,roughness:1,transparent:!1,depthTest:!0,side:Qr})),d.DefaultMaterial}function qe(d,e,t){for(const s in t.extensions)d[s]===void 0&&(e.userData.gltfExtensions=e.userData.gltfExtensions||{},e.userData.gltfExtensions[s]=t.extensions[s])}function ke(d,e){e.extras!==void 0&&(typeof e.extras=="object"?Object.assign(d.userData,e.extras):console.warn("THREE.GLTFLoader: Ignoring primitive type .extras, "+e.extras))}function Cs(d,e,t){let s=!1,r=!1,o=!1;for(let u=0,h=e.length;u<h;u++){const p=e[u];if(p.POSITION!==void 0&&(s=!0),p.NORMAL!==void 0&&(r=!0),p.COLOR_0!==void 0&&(o=!0),s&&r&&o)break}if(!s&&!r&&!o)return Promise.resolve(d);const i=[],l=[],c=[];for(let u=0,h=e.length;u<h;u++){const p=e[u];if(s){const v=p.POSITION!==void 0?t.getDependency("accessor",p.POSITION):d.attributes.position;i.push(v)}if(r){const v=p.NORMAL!==void 0?t.getDependency("accessor",p.NORMAL):d.attributes.normal;l.push(v)}if(o){const v=p.COLOR_0!==void 0?t.getDependency("accessor",p.COLOR_0):d.attributes.color;c.push(v)}}return Promise.all([Promise.all(i),Promise.all(l),Promise.all(c)]).then(function(u){const h=u[0],p=u[1],v=u[2];return s&&(d.morphAttributes.position=h),r&&(d.morphAttributes.normal=p),o&&(d.morphAttributes.color=v),d.morphTargetsRelative=!0,d})}function Ds(d,e){if(d.updateMorphTargets(),e.weights!==void 0)for(let t=0,s=e.weights.length;t<s;t++)d.morphTargetInfluences[t]=e.weights[t];if(e.extras&&Array.isArray(e.extras.targetNames)){const t=e.extras.targetNames;if(d.morphTargetInfluences.length===t.length){d.morphTargetDictionary={};for(let s=0,r=t.length;s<r;s++)d.morphTargetDictionary[t[s]]=s}else console.warn("THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.")}}function Os(d){let e;const t=d.extensions&&d.extensions[P.KHR_DRACO_MESH_COMPRESSION];if(t?e="draco:"+t.bufferView+":"+t.indices+":"+Ot(t.attributes):e=d.indices+":"+Ot(d.attributes)+":"+d.mode,d.targets!==void 0)for(let s=0,r=d.targets.length;s<r;s++)e+=":"+Ot(d.targets[s]);return e}function Ot(d){let e="";const t=Object.keys(d).sort();for(let s=0,r=t.length;s<r;s++)e+=t[s]+":"+d[t[s]]+";";return e}function Zt(d){switch(d){case Int8Array:return 1/127;case Uint8Array:return 1/255;case Int16Array:return 1/32767;case Uint16Array:return 1/65535;default:throw new Error("THREE.GLTFLoader: Unsupported normalized accessor component type.")}}function Bs(d){return d.search(/\.jpe?g($|\?)/i)>0||d.search(/^data\:image\/jpeg/)===0?"image/jpeg":d.search(/\.webp($|\?)/i)>0||d.search(/^data\:image\/webp/)===0?"image/webp":d.search(/\.ktx2($|\?)/i)>0||d.search(/^data\:image\/ktx2/)===0?"image/ktx2":"image/png"}const Fs=new gt;class Hs{constructor(e={},t={}){this.json=e,this.extensions={},this.plugins={},this.options=t,this.cache=new os,this.associations=new Map,this.primitiveCache={},this.nodeCache={},this.meshCache={refs:{},uses:{}},this.cameraCache={refs:{},uses:{}},this.lightCache={refs:{},uses:{}},this.sourceCache={},this.textureCache={},this.nodeNamesUsed={};let s=!1,r=-1,o=!1,i=-1;if(typeof navigator<"u"){const l=navigator.userAgent;s=/^((?!chrome|android).)*safari/i.test(l)===!0;const c=l.match(/Version\/(\d+)/);r=s&&c?parseInt(c[1],10):-1,o=l.indexOf("Firefox")>-1,i=o?l.match(/Firefox\/([0-9]+)\./)[1]:-1}typeof createImageBitmap>"u"||s&&r<17||o&&i<98?this.textureLoader=new Mr(this.options.manager):this.textureLoader=new Lr(this.options.manager),this.textureLoader.setCrossOrigin(this.options.crossOrigin),this.textureLoader.setRequestHeader(this.options.requestHeader),this.fileLoader=new xn(this.options.manager),this.fileLoader.setResponseType("arraybuffer"),this.options.crossOrigin==="use-credentials"&&this.fileLoader.setWithCredentials(!0)}setExtensions(e){this.extensions=e}setPlugins(e){this.plugins=e}parse(e,t){const s=this,r=this.json,o=this.extensions;this.cache.removeAll(),this.nodeCache={},this._invokeAll(function(i){return i._markDefs&&i._markDefs()}),Promise.all(this._invokeAll(function(i){return i.beforeRoot&&i.beforeRoot()})).then(function(){return Promise.all([s.getDependencies("scene"),s.getDependencies("animation"),s.getDependencies("camera")])}).then(function(i){const l={scene:i[0][r.scene||0],scenes:i[0],animations:i[1],cameras:i[2],asset:r.asset,parser:s,userData:{}};return qe(o,l,r),ke(l,r),Promise.all(s._invokeAll(function(c){return c.afterRoot&&c.afterRoot(l)})).then(function(){for(const c of l.scenes)c.updateMatrixWorld();e(l)})}).catch(t)}_markDefs(){const e=this.json.nodes||[],t=this.json.skins||[],s=this.json.meshes||[];for(let r=0,o=t.length;r<o;r++){const i=t[r].joints;for(let l=0,c=i.length;l<c;l++)e[i[l]].isBone=!0}for(let r=0,o=e.length;r<o;r++){const i=e[r];i.mesh!==void 0&&(this._addNodeRef(this.meshCache,i.mesh),i.skin!==void 0&&(s[i.mesh].isSkinnedMesh=!0)),i.camera!==void 0&&this._addNodeRef(this.cameraCache,i.camera)}}_addNodeRef(e,t){t!==void 0&&(e.refs[t]===void 0&&(e.refs[t]=e.uses[t]=0),e.refs[t]++)}_getNodeRef(e,t,s){if(e.refs[t]<=1)return s;const r=s.clone(),o=(i,l)=>{const c=this.associations.get(i);c!=null&&this.associations.set(l,c);for(const[u,h]of i.children.entries())o(h,l.children[u])};return o(s,r),r.name+="_instance_"+e.uses[t]++,r}_invokeOne(e){const t=Object.values(this.plugins);t.push(this);for(let s=0;s<t.length;s++){const r=e(t[s]);if(r)return r}return null}_invokeAll(e){const t=Object.values(this.plugins);t.unshift(this);const s=[];for(let r=0;r<t.length;r++){const o=e(t[r]);o&&s.push(o)}return s}getDependency(e,t){const s=e+":"+t;let r=this.cache.get(s);if(!r){switch(e){case"scene":r=this.loadScene(t);break;case"node":r=this._invokeOne(function(o){return o.loadNode&&o.loadNode(t)});break;case"mesh":r=this._invokeOne(function(o){return o.loadMesh&&o.loadMesh(t)});break;case"accessor":r=this.loadAccessor(t);break;case"bufferView":r=this._invokeOne(function(o){return o.loadBufferView&&o.loadBufferView(t)});break;case"buffer":r=this.loadBuffer(t);break;case"material":r=this._invokeOne(function(o){return o.loadMaterial&&o.loadMaterial(t)});break;case"texture":r=this._invokeOne(function(o){return o.loadTexture&&o.loadTexture(t)});break;case"skin":r=this.loadSkin(t);break;case"animation":r=this._invokeOne(function(o){return o.loadAnimation&&o.loadAnimation(t)});break;case"camera":r=this.loadCamera(t);break;default:if(r=this._invokeOne(function(o){return o!=this&&o.getDependency&&o.getDependency(e,t)}),!r)throw new Error("Unknown type: "+e);break}this.cache.add(s,r)}return r}getDependencies(e){let t=this.cache.get(e);if(!t){const s=this,r=this.json[e+(e==="mesh"?"es":"s")]||[];t=Promise.all(r.map(function(o,i){return s.getDependency(e,i)})),this.cache.add(e,t)}return t}loadBuffer(e){const t=this.json.buffers[e],s=this.fileLoader;if(t.type&&t.type!=="arraybuffer")throw new Error("THREE.GLTFLoader: "+t.type+" buffer type is not supported.");if(t.uri===void 0&&e===0)return Promise.resolve(this.extensions[P.KHR_BINARY_GLTF].body);const r=this.options;return new Promise(function(o,i){s.load(pt.resolveURL(t.uri,r.path),o,void 0,function(){i(new Error('THREE.GLTFLoader: Failed to load buffer "'+t.uri+'".'))})})}loadBufferView(e){const t=this.json.bufferViews[e];return this.getDependency("buffer",t.buffer).then(function(s){const r=t.byteLength||0,o=t.byteOffset||0;return s.slice(o,o+r)})}loadAccessor(e){const t=this,s=this.json,r=this.json.accessors[e];if(r.bufferView===void 0&&r.sparse===void 0){const i=Ct[r.type],l=rt[r.componentType],c=r.normalized===!0,u=new l(r.count*i);return Promise.resolve(new bt(u,i,c))}const o=[];return r.bufferView!==void 0?o.push(this.getDependency("bufferView",r.bufferView)):o.push(null),r.sparse!==void 0&&(o.push(this.getDependency("bufferView",r.sparse.indices.bufferView)),o.push(this.getDependency("bufferView",r.sparse.values.bufferView))),Promise.all(o).then(function(i){const l=i[0],c=Ct[r.type],u=rt[r.componentType],h=u.BYTES_PER_ELEMENT,p=h*c,v=r.byteOffset||0,T=r.bufferView!==void 0?s.bufferViews[r.bufferView].byteStride:void 0,I=r.normalized===!0;let C,R;if(T&&T!==p){const N=Math.floor(v/T),G="InterleavedBuffer:"+r.bufferView+":"+r.componentType+":"+N+":"+r.count;let Z=t.cache.get(G);Z||(C=new u(l,N*T,r.count*T/h),Z=new Ur(C,T/h),t.cache.add(G,Z)),R=new Ye(Z,c,v%T/h,I)}else l===null?C=new u(r.count*c):C=new u(l,v,r.count*c),R=new bt(C,c,I);if(r.sparse!==void 0){const N=Ct.SCALAR,G=rt[r.sparse.indices.componentType],Z=r.sparse.indices.byteOffset||0,D=r.sparse.values.byteOffset||0,ue=new G(i[1],Z,r.sparse.count*N),ce=new u(i[2],D,r.sparse.count*c);l!==null&&(R=new bt(R.array.slice(),R.itemSize,R.normalized)),R.normalized=!1;for(let oe=0,M=ue.length;oe<M;oe++){const F=ue[oe];if(R.setX(F,ce[oe*c]),c>=2&&R.setY(F,ce[oe*c+1]),c>=3&&R.setZ(F,ce[oe*c+2]),c>=4&&R.setW(F,ce[oe*c+3]),c>=5)throw new Error("THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.")}R.normalized=I}return R})}loadTexture(e){const t=this.json,s=this.options,o=t.textures[e].source,i=t.images[o];let l=this.textureLoader;if(i.uri){const c=s.manager.getHandler(i.uri);c!==null&&(l=c)}return this.loadTextureImage(e,o,l)}loadTextureImage(e,t,s){const r=this,o=this.json,i=o.textures[e],l=o.images[t],c=(l.uri||l.bufferView)+":"+i.sampler;if(this.textureCache[c])return this.textureCache[c];const u=this.loadImageSource(t,s).then(function(h){h.flipY=!1,h.name=i.name||l.name||"",h.name===""&&typeof l.uri=="string"&&l.uri.startsWith("data:image/")===!1&&(h.name=l.uri);const v=(o.samplers||{})[i.sampler]||{};return h.magFilter=mn[v.magFilter]||Je,h.minFilter=mn[v.minFilter]||In,h.wrapS=vn[v.wrapS]||zt,h.wrapT=vn[v.wrapT]||zt,h.generateMipmaps=!h.isCompressedTexture&&h.minFilter!==Mn&&h.minFilter!==Je,r.associations.set(h,{textures:e}),h}).catch(function(){return null});return this.textureCache[c]=u,u}loadImageSource(e,t){const s=this,r=this.json,o=this.options;if(this.sourceCache[e]!==void 0)return this.sourceCache[e].then(p=>p.clone());const i=r.images[e],l=self.URL||self.webkitURL;let c=i.uri||"",u=!1;if(i.bufferView!==void 0)c=s.getDependency("bufferView",i.bufferView).then(function(p){u=!0;const v=new Blob([p],{type:i.mimeType});return c=l.createObjectURL(v),c});else if(i.uri===void 0)throw new Error("THREE.GLTFLoader: Image "+e+" is missing URI and bufferView");const h=Promise.resolve(c).then(function(p){return new Promise(function(v,T){let I=v;t.isImageBitmapLoader===!0&&(I=function(C){const R=new on(C);R.needsUpdate=!0,v(R)}),t.load(pt.resolveURL(p,o.path),I,void 0,T)})}).then(function(p){return u===!0&&l.revokeObjectURL(c),ke(p,i),p.userData.mimeType=i.mimeType||Bs(i.uri),p}).catch(function(p){throw console.error("THREE.GLTFLoader: Couldn't load texture",c),p});return this.sourceCache[e]=h,h}assignTexture(e,t,s,r){const o=this;return this.getDependency("texture",s.index).then(function(i){if(!i)return null;if(s.texCoord!==void 0&&s.texCoord>0&&(i=i.clone(),i.channel=s.texCoord),o.extensions[P.KHR_TEXTURE_TRANSFORM]){const l=s.extensions!==void 0?s.extensions[P.KHR_TEXTURE_TRANSFORM]:void 0;if(l){const c=o.associations.get(i);i=o.extensions[P.KHR_TEXTURE_TRANSFORM].extendTexture(i,l),o.associations.set(i,c)}}return r!==void 0&&(i.colorSpace=r),e[t]=i,i})}assignFinalMaterial(e){const t=e.geometry;let s=e.material;const r=t.attributes.tangent===void 0,o=t.attributes.color!==void 0,i=t.attributes.normal===void 0;if(e.isPoints){const l="PointsMaterial:"+s.uuid;let c=this.cache.get(l);c||(c=new Fr,Ut.prototype.copy.call(c,s),c.color.copy(s.color),c.map=s.map,c.sizeAttenuation=!1,this.cache.add(l,c)),s=c}else if(e.isLine){const l="LineBasicMaterial:"+s.uuid;let c=this.cache.get(l);c||(c=new Hr,Ut.prototype.copy.call(c,s),c.color.copy(s.color),c.map=s.map,this.cache.add(l,c)),s=c}if(r||o||i){let l="ClonedMaterial:"+s.uuid+":";r&&(l+="derivative-tangents:"),o&&(l+="vertex-colors:"),i&&(l+="flat-shading:");let c=this.cache.get(l);c||(c=s.clone(),o&&(c.vertexColors=!0),i&&(c.flatShading=!0),r&&(c.normalScale&&(c.normalScale.y*=-1),c.clearcoatNormalScale&&(c.clearcoatNormalScale.y*=-1)),this.cache.add(l,c),this.associations.set(c,this.associations.get(s))),s=c}e.material=s}getMaterialType(){return Ln}loadMaterial(e){const t=this,s=this.json,r=this.extensions,o=s.materials[e];let i;const l={},c=o.extensions||{},u=[];if(c[P.KHR_MATERIALS_UNLIT]){const p=r[P.KHR_MATERIALS_UNLIT];i=p.getMaterialType(),u.push(p.extendParams(l,o,t))}else{const p=o.pbrMetallicRoughness||{};if(l.color=new $e(1,1,1),l.opacity=1,Array.isArray(p.baseColorFactor)){const v=p.baseColorFactor;l.color.setRGB(v[0],v[1],v[2],Pe),l.opacity=v[3]}p.baseColorTexture!==void 0&&u.push(t.assignTexture(l,"map",p.baseColorTexture,vt)),l.metalness=p.metallicFactor!==void 0?p.metallicFactor:1,l.roughness=p.roughnessFactor!==void 0?p.roughnessFactor:1,p.metallicRoughnessTexture!==void 0&&(u.push(t.assignTexture(l,"metalnessMap",p.metallicRoughnessTexture)),u.push(t.assignTexture(l,"roughnessMap",p.metallicRoughnessTexture))),i=this._invokeOne(function(v){return v.getMaterialType&&v.getMaterialType(e)}),u.push(Promise.all(this._invokeAll(function(v){return v.extendMaterialParams&&v.extendMaterialParams(e,l)})))}o.doubleSided===!0&&(l.side=Un);const h=o.alphaMode||Dt.OPAQUE;if(h===Dt.BLEND?(l.transparent=!0,l.depthWrite=!1):(l.transparent=!1,h===Dt.MASK&&(l.alphaTest=o.alphaCutoff!==void 0?o.alphaCutoff:.5)),o.normalTexture!==void 0&&i!==dt&&(u.push(t.assignTexture(l,"normalMap",o.normalTexture)),l.normalScale=new Xt(1,1),o.normalTexture.scale!==void 0)){const p=o.normalTexture.scale;l.normalScale.set(p,p)}if(o.occlusionTexture!==void 0&&i!==dt&&(u.push(t.assignTexture(l,"aoMap",o.occlusionTexture)),o.occlusionTexture.strength!==void 0&&(l.aoMapIntensity=o.occlusionTexture.strength)),o.emissiveFactor!==void 0&&i!==dt){const p=o.emissiveFactor;l.emissive=new $e().setRGB(p[0],p[1],p[2],Pe)}return o.emissiveTexture!==void 0&&i!==dt&&u.push(t.assignTexture(l,"emissiveMap",o.emissiveTexture,vt)),Promise.all(u).then(function(){const p=new i(l);return o.name&&(p.name=o.name),ke(p,o),t.associations.set(p,{materials:e}),o.extensions&&qe(r,p,o),p})}createUniqueName(e){const t=kr.sanitizeNodeName(e||"");return t in this.nodeNamesUsed?t+"_"+ ++this.nodeNamesUsed[t]:(this.nodeNamesUsed[t]=0,t)}loadGeometries(e){const t=this,s=this.extensions,r=this.primitiveCache;function o(l){return s[P.KHR_DRACO_MESH_COMPRESSION].decodePrimitive(l,t).then(function(c){return gn(c,l,t)})}const i=[];for(let l=0,c=e.length;l<c;l++){const u=e[l],h=Os(u),p=r[h];if(p)i.push(p.promise);else{let v;u.extensions&&u.extensions[P.KHR_DRACO_MESH_COMPRESSION]?v=o(u):v=gn(new _n,u,t),r[h]={primitive:u,promise:v},i.push(v)}}return Promise.all(i)}loadMesh(e){const t=this,s=this.json,r=this.extensions,o=s.meshes[e],i=o.primitives,l=[];for(let c=0,u=i.length;c<u;c++){const h=i[c].material===void 0?Ns(this.cache):this.getDependency("material",i[c].material);l.push(h)}return l.push(t.loadGeometries(i)),Promise.all(l).then(function(c){const u=c.slice(0,c.length-1),h=c[c.length-1],p=[];for(let T=0,I=h.length;T<I;T++){const C=h[T],R=i[T];let N;const G=u[T];if(R.mode===xe.TRIANGLES||R.mode===xe.TRIANGLE_STRIP||R.mode===xe.TRIANGLE_FAN||R.mode===void 0)N=o.isSkinnedMesh===!0?new Pr(C,G):new qt(C,G),N.isSkinnedMesh===!0&&N.normalizeSkinWeights(),R.mode===xe.TRIANGLE_STRIP?N.geometry=dn(N.geometry,yn):R.mode===xe.TRIANGLE_FAN&&(N.geometry=dn(N.geometry,Gt));else if(R.mode===xe.LINES)N=new Gr(C,G);else if(R.mode===xe.LINE_STRIP)N=new zr(C,G);else if(R.mode===xe.LINE_LOOP)N=new Kr(C,G);else if(R.mode===xe.POINTS)N=new jr(C,G);else throw new Error("THREE.GLTFLoader: Primitive mode unsupported: "+R.mode);Object.keys(N.geometry.morphAttributes).length>0&&Ds(N,o),N.name=t.createUniqueName(o.name||"mesh_"+e),ke(N,o),R.extensions&&qe(r,N,R),t.assignFinalMaterial(N),p.push(N)}for(let T=0,I=p.length;T<I;T++)t.associations.set(p[T],{meshes:e,primitives:T});if(p.length===1)return o.extensions&&qe(r,p[0],o),p[0];const v=new Nt;o.extensions&&qe(r,v,o),t.associations.set(v,{meshes:e});for(let T=0,I=p.length;T<I;T++)v.add(p[T]);return v})}loadCamera(e){let t;const s=this.json.cameras[e],r=s[s.type];if(!r){console.warn("THREE.GLTFLoader: Missing camera parameters.");return}return s.type==="perspective"?t=new Zr(Nn.radToDeg(r.yfov),r.aspectRatio||1,r.znear||1,r.zfar||2e6):s.type==="orthographic"&&(t=new Wr(-r.xmag,r.xmag,r.ymag,-r.ymag,r.znear,r.zfar)),s.name&&(t.name=this.createUniqueName(s.name)),ke(t,s),Promise.resolve(t)}loadSkin(e){const t=this.json.skins[e],s=[];for(let r=0,o=t.joints.length;r<o;r++)s.push(this._loadNodeShallow(t.joints[r]));return t.inverseBindMatrices!==void 0?s.push(this.getDependency("accessor",t.inverseBindMatrices)):s.push(null),Promise.all(s).then(function(r){const o=r.pop(),i=r,l=[],c=[];for(let u=0,h=i.length;u<h;u++){const p=i[u];if(p){l.push(p);const v=new gt;o!==null&&v.fromArray(o.array,u*16),c.push(v)}else console.warn('THREE.GLTFLoader: Joint "%s" could not be found.',t.joints[u])}return new Vr(l,c)})}loadAnimation(e){const t=this.json,s=this,r=t.animations[e],o=r.name?r.name:"animation_"+e,i=[],l=[],c=[],u=[],h=[];for(let p=0,v=r.channels.length;p<v;p++){const T=r.channels[p],I=r.samplers[T.sampler],C=T.target,R=C.node,N=r.parameters!==void 0?r.parameters[I.input]:I.input,G=r.parameters!==void 0?r.parameters[I.output]:I.output;C.node!==void 0&&(i.push(this.getDependency("node",R)),l.push(this.getDependency("accessor",N)),c.push(this.getDependency("accessor",G)),u.push(I),h.push(C))}return Promise.all([Promise.all(i),Promise.all(l),Promise.all(c),Promise.all(u),Promise.all(h)]).then(function(p){const v=p[0],T=p[1],I=p[2],C=p[3],R=p[4],N=[];for(let G=0,Z=v.length;G<Z;G++){const D=v[G],ue=T[G],ce=I[G],oe=C[G],M=R[G];if(D===void 0)continue;D.updateMatrix&&D.updateMatrix();const F=s._createAnimationTracks(D,ue,ce,oe,M);if(F)for(let K=0;K<F.length;K++)N.push(F[K])}return new Xr(o,void 0,N)})}createNodeMesh(e){const t=this.json,s=this,r=t.nodes[e];return r.mesh===void 0?null:s.getDependency("mesh",r.mesh).then(function(o){const i=s._getNodeRef(s.meshCache,r.mesh,o);return r.weights!==void 0&&i.traverse(function(l){if(l.isMesh)for(let c=0,u=r.weights.length;c<u;c++)l.morphTargetInfluences[c]=r.weights[c]}),i})}loadNode(e){const t=this.json,s=this,r=t.nodes[e],o=s._loadNodeShallow(e),i=[],l=r.children||[];for(let u=0,h=l.length;u<h;u++)i.push(s.getDependency("node",l[u]));const c=r.skin===void 0?Promise.resolve(null):s.getDependency("skin",r.skin);return Promise.all([o,Promise.all(i),c]).then(function(u){const h=u[0],p=u[1],v=u[2];v!==null&&h.traverse(function(T){T.isSkinnedMesh&&T.bind(v,Fs)});for(let T=0,I=p.length;T<I;T++)h.add(p[T]);return h})}_loadNodeShallow(e){const t=this.json,s=this.extensions,r=this;if(this.nodeCache[e]!==void 0)return this.nodeCache[e];const o=t.nodes[e],i=o.name?r.createUniqueName(o.name):"",l=[],c=r._invokeOne(function(u){return u.createNodeMesh&&u.createNodeMesh(e)});return c&&l.push(c),o.camera!==void 0&&l.push(r.getDependency("camera",o.camera).then(function(u){return r._getNodeRef(r.cameraCache,o.camera,u)})),r._invokeAll(function(u){return u.createNodeAttachment&&u.createNodeAttachment(e)}).forEach(function(u){l.push(u)}),this.nodeCache[e]=Promise.all(l).then(function(u){let h;if(o.isBone===!0?h=new qr:u.length>1?h=new Nt:u.length===1?h=u[0]:h=new Rn,h!==u[0])for(let p=0,v=u.length;p<v;p++)h.add(u[p]);if(o.name&&(h.userData.name=o.name,h.name=i),ke(h,o),o.extensions&&qe(s,h,o),o.matrix!==void 0){const p=new gt;p.fromArray(o.matrix),h.applyMatrix4(p)}else o.translation!==void 0&&h.position.fromArray(o.translation),o.rotation!==void 0&&h.quaternion.fromArray(o.rotation),o.scale!==void 0&&h.scale.fromArray(o.scale);return r.associations.has(h)||r.associations.set(h,{}),r.associations.get(h).nodes=e,h}),this.nodeCache[e]}loadScene(e){const t=this.extensions,s=this.json.scenes[e],r=this,o=new Nt;s.name&&(o.name=r.createUniqueName(s.name)),ke(o,s),s.extensions&&qe(t,o,s);const i=s.nodes||[],l=[];for(let c=0,u=i.length;c<u;c++)l.push(r.getDependency("node",i[c]));return Promise.all(l).then(function(c){for(let h=0,p=c.length;h<p;h++)o.add(c[h]);const u=h=>{const p=new Map;for(const[v,T]of r.associations)(v instanceof Ut||v instanceof on)&&p.set(v,T);return h.traverse(v=>{const T=r.associations.get(v);T!=null&&p.set(v,T)}),p};return r.associations=u(o),o})}_createAnimationTracks(e,t,s,r,o){const i=[],l=e.name?e.name:e.uuid,c=[];Ke[o.path]===Ke.weights?e.traverse(function(v){v.morphTargetInfluences&&c.push(v.name?v.name:v.uuid)}):c.push(l);let u;switch(Ke[o.path]){case Ke.weights:u=cn;break;case Ke.rotation:u=ln;break;case Ke.position:case Ke.scale:u=an;break;default:switch(s.itemSize){case 1:u=cn;break;case 2:case 3:default:u=an;break}break}const h=r.interpolation!==void 0?Us[r.interpolation]:Cn,p=this._getArrayFromAccessor(s);for(let v=0,T=c.length;v<T;v++){const I=new u(c[v]+"."+Ke[o.path],t.array,p,h);r.interpolation==="CUBICSPLINE"&&this._createCubicSplineTrackInterpolant(I),i.push(I)}return i}_getArrayFromAccessor(e){let t=e.array;if(e.normalized){const s=Zt(t.constructor),r=new Float32Array(t.length);for(let o=0,i=t.length;o<i;o++)r[o]=t[o]*s;t=r}return t}_createCubicSplineTrackInterpolant(e){e.createInterpolant=function(s){const r=this instanceof ln?Ls:Hn;return new r(this.times,this.values,this.getValueSize()/3,s)},e.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline=!0}}function ks(d,e,t){const s=e.attributes,r=new Mt;if(s.POSITION!==void 0){const l=t.json.accessors[s.POSITION],c=l.min,u=l.max;if(c!==void 0&&u!==void 0){if(r.set(new Te(c[0],c[1],c[2]),new Te(u[0],u[1],u[2])),l.normalized){const h=Zt(rt[l.componentType]);r.min.multiplyScalar(h),r.max.multiplyScalar(h)}}else{console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.");return}}else return;const o=e.targets;if(o!==void 0){const l=new Te,c=new Te;for(let u=0,h=o.length;u<h;u++){const p=o[u];if(p.POSITION!==void 0){const v=t.json.accessors[p.POSITION],T=v.min,I=v.max;if(T!==void 0&&I!==void 0){if(c.setX(Math.max(Math.abs(T[0]),Math.abs(I[0]))),c.setY(Math.max(Math.abs(T[1]),Math.abs(I[1]))),c.setZ(Math.max(Math.abs(T[2]),Math.abs(I[2]))),v.normalized){const C=Zt(rt[v.componentType]);c.multiplyScalar(C)}l.max(c)}else console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.")}}r.expandByVector(l)}d.boundingBox=r;const i=new Yt;r.getCenter(i.center),i.radius=r.min.distanceTo(r.max)/2,d.boundingSphere=i}function gn(d,e,t){const s=e.attributes,r=[];function o(i,l){return t.getDependency("accessor",i).then(function(c){d.setAttribute(l,c)})}for(const i in s){const l=jt[i]||i.toLowerCase();l in d.attributes||r.push(o(s[i],l))}if(e.indices!==void 0&&!d.index){const i=t.getDependency("accessor",e.indices).then(function(l){d.setIndex(l)});r.push(i)}return un.workingColorSpace!==Pe&&"COLOR_0"in s&&console.warn(`THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${un.workingColorSpace}" not supported.`),ke(d,e),ks(d,e,t),Promise.all(r).then(function(){return e.targets!==void 0?Cs(d,e.targets,t):d})}let ft;function ci(){var d;if(ft!==void 0)return ft;try{let e;const t=document.createElement("canvas");return ft=!!(window.WebGL2RenderingContext&&(e=t.getContext("webgl2"))),e&&((d=e.getExtension("WEBGL_lose_context"))==null||d.loseContext()),ft}catch{return ft=!1}}const kn=parseInt(Jr.replace(/\D+/g,""));var be=Uint8Array,We=Uint16Array,Wt=Uint32Array,Pn=new be([0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0,0,0,0]),Gn=new be([0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,0,0]),Ps=new be([16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15]),zn=function(d,e){for(var t=new We(31),s=0;s<31;++s)t[s]=e+=1<<d[s-1];for(var r=new Wt(t[30]),s=1;s<30;++s)for(var o=t[s];o<t[s+1];++o)r[o]=o-t[s]<<5|s;return[t,r]},Kn=zn(Pn,2),jn=Kn[0],Gs=Kn[1];jn[28]=258,Gs[258]=28;var zs=zn(Gn,0),Ks=zs[0],Vt=new We(32768);for(var ne=0;ne<32768;++ne){var je=(ne&43690)>>>1|(ne&21845)<<1;je=(je&52428)>>>2|(je&13107)<<2,je=(je&61680)>>>4|(je&3855)<<4,Vt[ne]=((je&65280)>>>8|(je&255)<<8)>>>1}var mt=function(d,e,t){for(var s=d.length,r=0,o=new We(e);r<s;++r)++o[d[r]-1];var i=new We(e);for(r=0;r<e;++r)i[r]=i[r-1]+o[r-1]<<1;var l;if(t){l=new We(1<<e);var c=15-e;for(r=0;r<s;++r)if(d[r])for(var u=r<<4|d[r],h=e-d[r],p=i[d[r]-1]++<<h,v=p|(1<<h)-1;p<=v;++p)l[Vt[p]>>>c]=u}else for(l=new We(s),r=0;r<s;++r)d[r]&&(l[r]=Vt[i[d[r]-1]++]>>>15-d[r]);return l},Tt=new be(288);for(var ne=0;ne<144;++ne)Tt[ne]=8;for(var ne=144;ne<256;++ne)Tt[ne]=9;for(var ne=256;ne<280;++ne)Tt[ne]=7;for(var ne=280;ne<288;++ne)Tt[ne]=8;var Zn=new be(32);for(var ne=0;ne<32;++ne)Zn[ne]=5;var js=mt(Tt,9,1),Zs=mt(Zn,5,1),Bt=function(d){for(var e=d[0],t=1;t<d.length;++t)d[t]>e&&(e=d[t]);return e},Me=function(d,e,t){var s=e/8|0;return(d[s]|d[s+1]<<8)>>(e&7)&t},Ft=function(d,e){var t=e/8|0;return(d[t]|d[t+1]<<8|d[t+2]<<16)>>(e&7)},Ws=function(d){return(d/8|0)+(d&7&&1)},Vs=function(d,e,t){(t==null||t>d.length)&&(t=d.length);var s=new(d instanceof We?We:d instanceof Wt?Wt:be)(t-e);return s.set(d.subarray(e,t)),s},Xs=function(d,e,t){var s=d.length;if(!s||t&&!t.l&&s<5)return e||new be(0);var r=!e||t,o=!t||t.i;t||(t={}),e||(e=new be(s*3));var i=function(X){var Be=e.length;if(X>Be){var Fe=new be(Math.max(Be*2,X));Fe.set(e),e=Fe}},l=t.f||0,c=t.p||0,u=t.b||0,h=t.l,p=t.d,v=t.m,T=t.n,I=s*8;do{if(!h){t.f=l=Me(d,c,1);var C=Me(d,c+1,3);if(c+=3,C)if(C==1)h=js,p=Zs,v=9,T=5;else if(C==2){var Z=Me(d,c,31)+257,D=Me(d,c+10,15)+4,ue=Z+Me(d,c+5,31)+1;c+=14;for(var ce=new be(ue),oe=new be(19),M=0;M<D;++M)oe[Ps[M]]=Me(d,c+M*3,7);c+=D*3;for(var F=Bt(oe),K=(1<<F)-1,Q=mt(oe,F,1),M=0;M<ue;){var j=Q[Me(d,c,K)];c+=j&15;var R=j>>>4;if(R<16)ce[M++]=R;else{var W=0,O=0;for(R==16?(O=3+Me(d,c,3),c+=2,W=ce[M-1]):R==17?(O=3+Me(d,c,7),c+=3):R==18&&(O=11+Me(d,c,127),c+=7);O--;)ce[M++]=W}}var re=ce.subarray(0,Z),k=ce.subarray(Z);v=Bt(re),T=Bt(k),h=mt(re,v,1),p=mt(k,T,1)}else throw"invalid block type";else{var R=Ws(c)+4,N=d[R-4]|d[R-3]<<8,G=R+N;if(G>s){if(o)throw"unexpected EOF";break}r&&i(u+N),e.set(d.subarray(R,G),u),t.b=u+=N,t.p=c=G*8;continue}if(c>I){if(o)throw"unexpected EOF";break}}r&&i(u+131072);for(var Re=(1<<v)-1,Ve=(1<<T)-1,Ie=c;;Ie=c){var W=h[Ft(d,c)&Re],ee=W>>>4;if(c+=W&15,c>I){if(o)throw"unexpected EOF";break}if(!W)throw"invalid length/literal";if(ee<256)e[u++]=ee;else if(ee==256){Ie=c,h=null;break}else{var Ge=ee-254;if(ee>264){var M=ee-257,se=Pn[M];Ge=Me(d,c,(1<<se)-1)+jn[M],c+=se}var he=p[Ft(d,c)&Ve],Le=he>>>4;if(!he)throw"invalid distance";c+=he&15;var k=Ks[Le];if(Le>3){var se=Gn[Le];k+=Ft(d,c)&(1<<se)-1,c+=se}if(c>I){if(o)throw"unexpected EOF";break}r&&i(u+131072);for(var st=u+Ge;u<st;u+=4)e[u]=e[u-k],e[u+1]=e[u+1-k],e[u+2]=e[u+2-k],e[u+3]=e[u+3-k];u=st}}t.l=h,t.p=Ie,t.b=u,h&&(l=1,t.m=v,t.d=p,t.n=T)}while(!l);return u==e.length?e:Vs(e,0,u)},qs=new be(0),Ys=function(d){if((d[0]&15)!=8||d[0]>>>4>7||(d[0]<<8|d[1])%31)throw"invalid zlib data";if(d[1]&32)throw"invalid zlib data: preset dictionaries not supported"};function wt(d,e){return Xs((Ys(d),d.subarray(2,-4)),e)}var Qs=typeof TextDecoder<"u"&&new TextDecoder,$s=0;try{Qs.decode(qs,{stream:!0}),$s=1}catch{}const Js=d=>d&&d.isCubeTexture;class li extends qt{constructor(e,t){var s,r;const o=Js(e),l=((r=o?(s=e.image[0])==null?void 0:s.width:e.image.width)!=null?r:1024)/4,c=Math.floor(Math.log2(l)),u=Math.pow(2,c),h=3*Math.max(u,16*7),p=4*u,v=[o?"#define ENVMAP_TYPE_CUBE":"",`#define CUBEUV_TEXEL_WIDTH ${1/h}`,`#define CUBEUV_TEXEL_HEIGHT ${1/p}`,`#define CUBEUV_MAX_MIP ${c}.0`],T=`
        varying vec3 vWorldPosition;
        void main() 
        {
            vec4 worldPosition = ( modelMatrix * vec4( position, 1.0 ) );
            vWorldPosition = worldPosition.xyz;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }
        `,I=v.join(`
`)+`
        #define ENVMAP_TYPE_CUBE_UV
        varying vec3 vWorldPosition;
        uniform float radius;
        uniform float height;
        uniform float angle;
        #ifdef ENVMAP_TYPE_CUBE
            uniform samplerCube map;
        #else
            uniform sampler2D map;
        #endif
        // From: https://www.shadertoy.com/view/4tsBD7
        float diskIntersectWithBackFaceCulling( vec3 ro, vec3 rd, vec3 c, vec3 n, float r ) 
        {
            float d = dot ( rd, n );
            
            if( d > 0.0 ) { return 1e6; }
            
            vec3  o = ro - c;
            float t = - dot( n, o ) / d;
            vec3  q = o + rd * t;
            
            return ( dot( q, q ) < r * r ) ? t : 1e6;
        }
        // From: https://www.iquilezles.org/www/articles/intersectors/intersectors.htm
        float sphereIntersect( vec3 ro, vec3 rd, vec3 ce, float ra ) 
        {
            vec3 oc = ro - ce;
            float b = dot( oc, rd );
            float c = dot( oc, oc ) - ra * ra;
            float h = b * b - c;
            
            if( h < 0.0 ) { return -1.0; }
            
            h = sqrt( h );
            
            return - b + h;
        }
        vec3 project() 
        {
            vec3 p = normalize( vWorldPosition );
            vec3 camPos = cameraPosition;
            camPos.y -= height;
            float intersection = sphereIntersect( camPos, p, vec3( 0.0 ), radius );
            if( intersection > 0.0 ) {
                
                vec3 h = vec3( 0.0, - height, 0.0 );
                float intersection2 = diskIntersectWithBackFaceCulling( camPos, p, h, vec3( 0.0, 1.0, 0.0 ), radius );
                p = ( camPos + min( intersection, intersection2 ) * p ) / radius;
            } else {
                p = vec3( 0.0, 1.0, 0.0 );
            }
            return p;
        }
        #include <common>
        #include <cube_uv_reflection_fragment>
        void main() 
        {
            vec3 projectedWorldPosition = project();
            
            #ifdef ENVMAP_TYPE_CUBE
                vec3 outcolor = textureCube( map, projectedWorldPosition ).rgb;
            #else
                vec3 direction = normalize( projectedWorldPosition );
                vec2 uv = equirectUv( direction );
                vec3 outcolor = texture2D( map, uv ).rgb;
            #endif
            gl_FragColor = vec4( outcolor, 1.0 );
            #include <tonemapping_fragment>
            #include <${kn>=154?"colorspace_fragment":"encodings_fragment"}>
        }
        `,C={map:{value:e},height:{value:t?.height||15},radius:{value:t?.radius||100}},R=new es(1,16),N=new Dn({uniforms:C,fragmentShader:I,vertexShader:T,side:Un});super(R,N)}set radius(e){this.material.uniforms.radius.value=e}get radius(){return this.material.uniforms.radius.value}set height(e){this.material.uniforms.height.value=e}get height(){return this.material.uniforms.height.value}}const ui={uniforms:{tDiffuse:{value:null},h:{value:1/512}},vertexShader:`
      varying vec2 vUv;

      void main() {

        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

      }
  `,fragmentShader:`
    uniform sampler2D tDiffuse;
    uniform float h;

    varying vec2 vUv;

    void main() {

    	vec4 sum = vec4( 0.0 );

    	sum += texture2D( tDiffuse, vec2( vUv.x - 4.0 * h, vUv.y ) ) * 0.051;
    	sum += texture2D( tDiffuse, vec2( vUv.x - 3.0 * h, vUv.y ) ) * 0.0918;
    	sum += texture2D( tDiffuse, vec2( vUv.x - 2.0 * h, vUv.y ) ) * 0.12245;
    	sum += texture2D( tDiffuse, vec2( vUv.x - 1.0 * h, vUv.y ) ) * 0.1531;
    	sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y ) ) * 0.1633;
    	sum += texture2D( tDiffuse, vec2( vUv.x + 1.0 * h, vUv.y ) ) * 0.1531;
    	sum += texture2D( tDiffuse, vec2( vUv.x + 2.0 * h, vUv.y ) ) * 0.12245;
    	sum += texture2D( tDiffuse, vec2( vUv.x + 3.0 * h, vUv.y ) ) * 0.0918;
    	sum += texture2D( tDiffuse, vec2( vUv.x + 4.0 * h, vUv.y ) ) * 0.051;

    	gl_FragColor = sum;

    }
  `},fi={uniforms:{tDiffuse:{value:null},v:{value:1/512}},vertexShader:`
    varying vec2 vUv;

    void main() {

      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );

    }
  `,fragmentShader:`

  uniform sampler2D tDiffuse;
  uniform float v;

  varying vec2 vUv;

  void main() {

    vec4 sum = vec4( 0.0 );

    sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 4.0 * v ) ) * 0.051;
    sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 3.0 * v ) ) * 0.0918;
    sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 2.0 * v ) ) * 0.12245;
    sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y - 1.0 * v ) ) * 0.1531;
    sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y ) ) * 0.1633;
    sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 1.0 * v ) ) * 0.1531;
    sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 2.0 * v ) ) * 0.12245;
    sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 3.0 * v ) ) * 0.0918;
    sum += texture2D( tDiffuse, vec2( vUv.x, vUv.y + 4.0 * v ) ) * 0.051;

    gl_FragColor = sum;

  }
  `};class hi extends On{constructor(e){super(e),this.type=Ze}parse(e){const i=function(M,F){switch(M){case 1:throw new Error("THREE.RGBELoader: Read Error: "+(F||""));case 2:throw new Error("THREE.RGBELoader: Write Error: "+(F||""));case 3:throw new Error("THREE.RGBELoader: Bad File Format: "+(F||""));default:case 4:throw new Error("THREE.RGBELoader: Memory Error: "+(F||""))}},h=`
`,p=function(M,F,K){F=F||1024;let j=M.pos,W=-1,O=0,re="",k=String.fromCharCode.apply(null,new Uint16Array(M.subarray(j,j+128)));for(;0>(W=k.indexOf(h))&&O<F&&j<M.byteLength;)re+=k,O+=k.length,j+=128,k+=String.fromCharCode.apply(null,new Uint16Array(M.subarray(j,j+128)));return-1<W?(M.pos+=O+W+1,re+k.slice(0,W)):!1},v=function(M){const F=/^#\?(\S+)/,K=/^\s*GAMMA\s*=\s*(\d+(\.\d+)?)\s*$/,Q=/^\s*EXPOSURE\s*=\s*(\d+(\.\d+)?)\s*$/,j=/^\s*FORMAT=(\S+)\s*$/,W=/^\s*\-Y\s+(\d+)\s+\+X\s+(\d+)\s*$/,O={valid:0,string:"",comments:"",programtype:"RGBE",format:"",gamma:1,exposure:1,width:0,height:0};let re,k;for((M.pos>=M.byteLength||!(re=p(M)))&&i(1,"no header found"),(k=re.match(F))||i(3,"bad initial token"),O.valid|=1,O.programtype=k[1],O.string+=re+`
`;re=p(M),re!==!1;){if(O.string+=re+`
`,re.charAt(0)==="#"){O.comments+=re+`
`;continue}if((k=re.match(K))&&(O.gamma=parseFloat(k[1])),(k=re.match(Q))&&(O.exposure=parseFloat(k[1])),(k=re.match(j))&&(O.valid|=2,O.format=k[1]),(k=re.match(W))&&(O.valid|=4,O.height=parseInt(k[1],10),O.width=parseInt(k[2],10)),O.valid&2&&O.valid&4)break}return O.valid&2||i(3,"missing format specifier"),O.valid&4||i(3,"missing image size specifier"),O},T=function(M,F,K){const Q=F;if(Q<8||Q>32767||M[0]!==2||M[1]!==2||M[2]&128)return new Uint8Array(M);Q!==(M[2]<<8|M[3])&&i(3,"wrong scanline width");const j=new Uint8Array(4*F*K);j.length||i(4,"unable to allocate buffer space");let W=0,O=0;const re=4*Q,k=new Uint8Array(4),Re=new Uint8Array(re);let Ve=K;for(;Ve>0&&O<M.byteLength;){O+4>M.byteLength&&i(1),k[0]=M[O++],k[1]=M[O++],k[2]=M[O++],k[3]=M[O++],(k[0]!=2||k[1]!=2||(k[2]<<8|k[3])!=Q)&&i(3,"bad rgbe scanline format");let Ie=0,ee;for(;Ie<re&&O<M.byteLength;){ee=M[O++];const se=ee>128;if(se&&(ee-=128),(ee===0||Ie+ee>re)&&i(3,"bad scanline data"),se){const he=M[O++];for(let Le=0;Le<ee;Le++)Re[Ie++]=he}else Re.set(M.subarray(O,O+ee),Ie),Ie+=ee,O+=ee}const Ge=Q;for(let se=0;se<Ge;se++){let he=0;j[W]=Re[se+he],he+=Q,j[W+1]=Re[se+he],he+=Q,j[W+2]=Re[se+he],he+=Q,j[W+3]=Re[se+he],W+=4}Ve--}return j},I=function(M,F,K,Q){const j=M[F+3],W=Math.pow(2,j-128)/255;K[Q+0]=M[F+0]*W,K[Q+1]=M[F+1]*W,K[Q+2]=M[F+2]*W,K[Q+3]=1},C=function(M,F,K,Q){const j=M[F+3],W=Math.pow(2,j-128)/255;K[Q+0]=tt.toHalfFloat(Math.min(M[F+0]*W,65504)),K[Q+1]=tt.toHalfFloat(Math.min(M[F+1]*W,65504)),K[Q+2]=tt.toHalfFloat(Math.min(M[F+2]*W,65504)),K[Q+3]=tt.toHalfFloat(1)},R=new Uint8Array(e);R.pos=0;const N=v(R),G=N.width,Z=N.height,D=T(R.subarray(R.pos),G,Z);let ue,ce,oe;switch(this.type){case nt:oe=D.length/4;const M=new Float32Array(oe*4);for(let K=0;K<oe;K++)I(D,K*4,M,K*4);ue=M,ce=nt;break;case Ze:oe=D.length/4;const F=new Uint16Array(oe*4);for(let K=0;K<oe;K++)C(D,K*4,F,K*4);ue=F,ce=Ze;break;default:throw new Error("THREE.RGBELoader: Unsupported type: "+this.type)}return{width:G,height:Z,data:ue,header:N.string,gamma:N.gamma,exposure:N.exposure,type:ce}}setDataType(e){return this.type=e,this}load(e,t,s,r){function o(i,l){switch(i.type){case nt:case Ze:"colorSpace"in i?i.colorSpace="srgb-linear":i.encoding=3e3,i.minFilter=Je,i.magFilter=Je,i.generateMipmaps=!1,i.flipY=!0;break}t&&t(i,l)}return super.load(e,o,s,r)}}const ht=kn>=152;class di extends On{constructor(e){super(e),this.type=Ze}parse(e){const F=Math.pow(2.7182818,2.2);function K(n,a){for(var f=0,m=0;m<65536;++m)(m==0||n[m>>3]&1<<(m&7))&&(a[f++]=m);for(var g=f-1;f<65536;)a[f++]=0;return g}function Q(n){for(var a=0;a<16384;a++)n[a]={},n[a].len=0,n[a].lit=0,n[a].p=null}const j={l:0,c:0,lc:0};function W(n,a,f,m,g){for(;f<n;)a=a<<8|rn(m,g),f+=8;f-=n,j.l=a>>f&(1<<n)-1,j.c=a,j.lc=f}const O=new Array(59);function re(n){for(var a=0;a<=58;++a)O[a]=0;for(var a=0;a<65537;++a)O[n[a]]+=1;for(var f=0,a=58;a>0;--a){var m=f+O[a]>>1;O[a]=f,f=m}for(var a=0;a<65537;++a){var g=n[a];g>0&&(n[a]=g|O[g]++<<6)}}function k(n,a,f,m,g,A,S){for(var E=f,y=0,_=0;g<=A;g++){if(E.value-f.value>m)return!1;W(6,y,_,n,E);var x=j.l;if(y=j.c,_=j.lc,S[g]=x,x==63){if(E.value-f.value>m)throw"Something wrong with hufUnpackEncTable";W(8,y,_,n,E);var w=j.l+6;if(y=j.c,_=j.lc,g+w>A+1)throw"Something wrong with hufUnpackEncTable";for(;w--;)S[g++]=0;g--}else if(x>=59){var w=x-59+2;if(g+w>A+1)throw"Something wrong with hufUnpackEncTable";for(;w--;)S[g++]=0;g--}}re(S)}function Re(n){return n&63}function Ve(n){return n>>6}function Ie(n,a,f,m){for(;a<=f;a++){var g=Ve(n[a]),A=Re(n[a]);if(g>>A)throw"Invalid table entry";if(A>14){var S=m[g>>A-14];if(S.len)throw"Invalid table entry";if(S.lit++,S.p){var E=S.p;S.p=new Array(S.lit);for(var y=0;y<S.lit-1;++y)S.p[y]=E[y]}else S.p=new Array(1);S.p[S.lit-1]=a}else if(A)for(var _=0,y=1<<14-A;y>0;y--){var S=m[(g<<14-A)+_];if(S.len||S.p)throw"Invalid table entry";S.len=A,S.lit=a,_++}}return!0}const ee={c:0,lc:0};function Ge(n,a,f,m){n=n<<8|rn(f,m),a+=8,ee.c=n,ee.lc=a}const se={c:0,lc:0};function he(n,a,f,m,g,A,S,E,y,_){if(n==a){m<8&&(Ge(f,m,g,S),f=ee.c,m=ee.lc),m-=8;var x=f>>m,x=new Uint8Array([x])[0];if(y.value+x>_)return!1;for(var w=E[y.value-1];x-- >0;)E[y.value++]=w}else if(y.value<_)E[y.value++]=n;else return!1;se.c=f,se.lc=m}function Le(n){return n&65535}function st(n){var a=Le(n);return a>32767?a-65536:a}const X={a:0,b:0};function Be(n,a){var f=st(n),m=st(a),g=m,A=f+(g&1)+(g>>1),S=A,E=A-g;X.a=S,X.b=E}function Fe(n,a){var f=Le(n),m=Le(a),g=f-(m>>1)&65535,A=m+g-32768&65535;X.a=A,X.b=g}function Wn(n,a,f,m,g,A,S){for(var E=S<16384,y=f>g?g:f,_=1,x;_<=y;)_<<=1;for(_>>=1,x=_,_>>=1;_>=1;){for(var w=0,ae=w+A*(g-x),L=A*_,U=A*x,B=m*_,H=m*x,q,$,le,Ae;w<=ae;w+=U){for(var J=w,Ue=w+m*(f-x);J<=Ue;J+=H){var te=J+B,fe=J+L,He=fe+B;E?(Be(n[J+a],n[fe+a]),q=X.a,le=X.b,Be(n[te+a],n[He+a]),$=X.a,Ae=X.b,Be(q,$),n[J+a]=X.a,n[te+a]=X.b,Be(le,Ae),n[fe+a]=X.a,n[He+a]=X.b):(Fe(n[J+a],n[fe+a]),q=X.a,le=X.b,Fe(n[te+a],n[He+a]),$=X.a,Ae=X.b,Fe(q,$),n[J+a]=X.a,n[te+a]=X.b,Fe(le,Ae),n[fe+a]=X.a,n[He+a]=X.b)}if(f&_){var fe=J+L;E?Be(n[J+a],n[fe+a]):Fe(n[J+a],n[fe+a]),q=X.a,n[fe+a]=X.b,n[J+a]=q}}if(g&_)for(var J=w,Ue=w+m*(f-x);J<=Ue;J+=H){var te=J+B;E?Be(n[J+a],n[te+a]):Fe(n[J+a],n[te+a]),q=X.a,n[te+a]=X.b,n[J+a]=q}x=_,_>>=1}return w}function Vn(n,a,f,m,g,A,S,E,y,_){for(var x=0,w=0,ae=E,L=Math.trunc(g.value+(A+7)/8);g.value<L;)for(Ge(x,w,f,g),x=ee.c,w=ee.lc;w>=14;){var U=x>>w-14&16383,B=a[U];if(B.len)w-=B.len,he(B.lit,S,x,w,f,m,g,y,_,ae),x=se.c,w=se.lc;else{if(!B.p)throw"hufDecode issues";var H;for(H=0;H<B.lit;H++){for(var q=Re(n[B.p[H]]);w<q&&g.value<L;)Ge(x,w,f,g),x=ee.c,w=ee.lc;if(w>=q&&Ve(n[B.p[H]])==(x>>w-q&(1<<q)-1)){w-=q,he(B.p[H],S,x,w,f,m,g,y,_,ae),x=se.c,w=se.lc;break}}if(H==B.lit)throw"hufDecode issues"}}var $=8-A&7;for(x>>=$,w-=$;w>0;){var B=a[x<<14-w&16383];if(B.len)w-=B.len,he(B.lit,S,x,w,f,m,g,y,_,ae),x=se.c,w=se.lc;else throw"hufDecode issues"}return!0}function Qt(n,a,f,m,g,A){var S={value:0},E=f.value,y=Ee(a,f),_=Ee(a,f);f.value+=4;var x=Ee(a,f);if(f.value+=4,y<0||y>=65537||_<0||_>=65537)throw"Something wrong with HUF_ENCSIZE";var w=new Array(65537),ae=new Array(16384);Q(ae);var L=m-(f.value-E);if(k(n,a,f,L,y,_,w),x>8*(m-(f.value-E)))throw"Something wrong with hufUncompress";Ie(w,y,_,ae),Vn(w,ae,n,a,f,x,_,A,g,S)}function Xn(n,a,f){for(var m=0;m<f;++m)a[m]=n[a[m]]}function $t(n){for(var a=1;a<n.length;a++){var f=n[a-1]+n[a]-128;n[a]=f}}function Jt(n,a){for(var f=0,m=Math.floor((n.length+1)/2),g=0,A=n.length-1;!(g>A||(a[g++]=n[f++],g>A));)a[g++]=n[m++]}function en(n){for(var a=n.byteLength,f=new Array,m=0,g=new DataView(n);a>0;){var A=g.getInt8(m++);if(A<0){var S=-A;a-=S+1;for(var E=0;E<S;E++)f.push(g.getUint8(m++))}else{var S=A;a-=2;for(var y=g.getUint8(m++),E=0;E<S+1;E++)f.push(y)}}return f}function qn(n,a,f,m,g,A){var te=new DataView(A.buffer),S=f[n.idx[0]].width,E=f[n.idx[0]].height,y=3,_=Math.floor(S/8),x=Math.ceil(S/8),w=Math.ceil(E/8),ae=S-(x-1)*8,L=E-(w-1)*8,U={value:0},B=new Array(y),H=new Array(y),q=new Array(y),$=new Array(y),le=new Array(y);for(let Y=0;Y<y;++Y)le[Y]=a[n.idx[Y]],B[Y]=Y<1?0:B[Y-1]+x*w,H[Y]=new Float32Array(64),q[Y]=new Uint16Array(64),$[Y]=new Uint16Array(x*64);for(let Y=0;Y<w;++Y){var Ae=8;Y==w-1&&(Ae=L);var J=8;for(let ie=0;ie<x;++ie){ie==x-1&&(J=ae);for(let V=0;V<y;++V)q[V].fill(0),q[V][0]=g[B[V]++],Yn(U,m,q[V]),Qn(q[V],H[V]),$n(H[V]);Jn(H);for(let V=0;V<y;++V)er(H[V],$[V],ie*64)}let ge=0;for(let ie=0;ie<y;++ie){const V=f[n.idx[ie]].type;for(let ye=8*Y;ye<8*Y+Ae;++ye){ge=le[ie][ye];for(let Xe=0;Xe<_;++Xe){const Se=Xe*64+(ye&7)*8;te.setUint16(ge+0*2*V,$[ie][Se+0],!0),te.setUint16(ge+1*2*V,$[ie][Se+1],!0),te.setUint16(ge+2*2*V,$[ie][Se+2],!0),te.setUint16(ge+3*2*V,$[ie][Se+3],!0),te.setUint16(ge+4*2*V,$[ie][Se+4],!0),te.setUint16(ge+5*2*V,$[ie][Se+5],!0),te.setUint16(ge+6*2*V,$[ie][Se+6],!0),te.setUint16(ge+7*2*V,$[ie][Se+7],!0),ge+=8*2*V}}if(_!=x)for(let ye=8*Y;ye<8*Y+Ae;++ye){const Xe=le[ie][ye]+8*_*2*V,Se=_*64+(ye&7)*8;for(let ze=0;ze<J;++ze)te.setUint16(Xe+ze*2*V,$[ie][Se+ze],!0)}}}for(var Ue=new Uint16Array(S),te=new DataView(A.buffer),fe=0;fe<y;++fe){f[n.idx[fe]].decoded=!0;var He=f[n.idx[fe]].type;if(f[fe].type==2)for(var lt=0;lt<E;++lt){const Y=le[fe][lt];for(var _e=0;_e<S;++_e)Ue[_e]=te.getUint16(Y+_e*2*He,!0);for(var _e=0;_e<S;++_e)te.setFloat32(Y+_e*2*He,b(Ue[_e]),!0)}}}function Yn(n,a,f){for(var m,g=1;g<64;)m=a[n.value],m==65280?g=64:m>>8==255?g+=m&255:(f[g]=m,g++),n.value++}function Qn(n,a){a[0]=b(n[0]),a[1]=b(n[1]),a[2]=b(n[5]),a[3]=b(n[6]),a[4]=b(n[14]),a[5]=b(n[15]),a[6]=b(n[27]),a[7]=b(n[28]),a[8]=b(n[2]),a[9]=b(n[4]),a[10]=b(n[7]),a[11]=b(n[13]),a[12]=b(n[16]),a[13]=b(n[26]),a[14]=b(n[29]),a[15]=b(n[42]),a[16]=b(n[3]),a[17]=b(n[8]),a[18]=b(n[12]),a[19]=b(n[17]),a[20]=b(n[25]),a[21]=b(n[30]),a[22]=b(n[41]),a[23]=b(n[43]),a[24]=b(n[9]),a[25]=b(n[11]),a[26]=b(n[18]),a[27]=b(n[24]),a[28]=b(n[31]),a[29]=b(n[40]),a[30]=b(n[44]),a[31]=b(n[53]),a[32]=b(n[10]),a[33]=b(n[19]),a[34]=b(n[23]),a[35]=b(n[32]),a[36]=b(n[39]),a[37]=b(n[45]),a[38]=b(n[52]),a[39]=b(n[54]),a[40]=b(n[20]),a[41]=b(n[22]),a[42]=b(n[33]),a[43]=b(n[38]),a[44]=b(n[46]),a[45]=b(n[51]),a[46]=b(n[55]),a[47]=b(n[60]),a[48]=b(n[21]),a[49]=b(n[34]),a[50]=b(n[37]),a[51]=b(n[47]),a[52]=b(n[50]),a[53]=b(n[56]),a[54]=b(n[59]),a[55]=b(n[61]),a[56]=b(n[35]),a[57]=b(n[36]),a[58]=b(n[48]),a[59]=b(n[49]),a[60]=b(n[57]),a[61]=b(n[58]),a[62]=b(n[62]),a[63]=b(n[63])}function $n(n){const a=.5*Math.cos(.7853975),f=.5*Math.cos(3.14159/16),m=.5*Math.cos(3.14159/8),g=.5*Math.cos(3*3.14159/16),A=.5*Math.cos(5*3.14159/16),S=.5*Math.cos(3*3.14159/8),E=.5*Math.cos(7*3.14159/16);for(var y=new Array(4),_=new Array(4),x=new Array(4),w=new Array(4),ae=0;ae<8;++ae){var L=ae*8;y[0]=m*n[L+2],y[1]=S*n[L+2],y[2]=m*n[L+6],y[3]=S*n[L+6],_[0]=f*n[L+1]+g*n[L+3]+A*n[L+5]+E*n[L+7],_[1]=g*n[L+1]-E*n[L+3]-f*n[L+5]-A*n[L+7],_[2]=A*n[L+1]-f*n[L+3]+E*n[L+5]+g*n[L+7],_[3]=E*n[L+1]-A*n[L+3]+g*n[L+5]-f*n[L+7],x[0]=a*(n[L+0]+n[L+4]),x[3]=a*(n[L+0]-n[L+4]),x[1]=y[0]+y[3],x[2]=y[1]-y[2],w[0]=x[0]+x[1],w[1]=x[3]+x[2],w[2]=x[3]-x[2],w[3]=x[0]-x[1],n[L+0]=w[0]+_[0],n[L+1]=w[1]+_[1],n[L+2]=w[2]+_[2],n[L+3]=w[3]+_[3],n[L+4]=w[3]-_[3],n[L+5]=w[2]-_[2],n[L+6]=w[1]-_[1],n[L+7]=w[0]-_[0]}for(var U=0;U<8;++U)y[0]=m*n[16+U],y[1]=S*n[16+U],y[2]=m*n[48+U],y[3]=S*n[48+U],_[0]=f*n[8+U]+g*n[24+U]+A*n[40+U]+E*n[56+U],_[1]=g*n[8+U]-E*n[24+U]-f*n[40+U]-A*n[56+U],_[2]=A*n[8+U]-f*n[24+U]+E*n[40+U]+g*n[56+U],_[3]=E*n[8+U]-A*n[24+U]+g*n[40+U]-f*n[56+U],x[0]=a*(n[U]+n[32+U]),x[3]=a*(n[U]-n[32+U]),x[1]=y[0]+y[3],x[2]=y[1]-y[2],w[0]=x[0]+x[1],w[1]=x[3]+x[2],w[2]=x[3]-x[2],w[3]=x[0]-x[1],n[0+U]=w[0]+_[0],n[8+U]=w[1]+_[1],n[16+U]=w[2]+_[2],n[24+U]=w[3]+_[3],n[32+U]=w[3]-_[3],n[40+U]=w[2]-_[2],n[48+U]=w[1]-_[1],n[56+U]=w[0]-_[0]}function Jn(n){for(var a=0;a<64;++a){var f=n[0][a],m=n[1][a],g=n[2][a];n[0][a]=f+1.5747*g,n[1][a]=f-.1873*m-.4682*g,n[2][a]=f+1.8556*m}}function er(n,a,f){for(var m=0;m<64;++m)a[f+m]=tt.toHalfFloat(tr(n[m]))}function tr(n){return n<=1?Math.sign(n)*Math.pow(Math.abs(n),2.2):Math.sign(n)*Math.pow(F,Math.abs(n)-1)}function tn(n){return new DataView(n.array.buffer,n.offset.value,n.size)}function nr(n){var a=n.viewer.buffer.slice(n.offset.value,n.offset.value+n.size),f=new Uint8Array(en(a)),m=new Uint8Array(f.length);return $t(f),Jt(f,m),new DataView(m.buffer)}function Lt(n){var a=n.array.slice(n.offset.value,n.offset.value+n.size),f=wt(a),m=new Uint8Array(f.length);return $t(f),Jt(f,m),new DataView(m.buffer)}function rr(n){for(var a=n.viewer,f={value:n.offset.value},m=new Uint16Array(n.width*n.scanlineBlockSize*(n.channels*n.type)),g=new Uint8Array(8192),A=0,S=new Array(n.channels),E=0;E<n.channels;E++)S[E]={},S[E].start=A,S[E].end=S[E].start,S[E].nx=n.width,S[E].ny=n.lines,S[E].size=n.type,A+=S[E].nx*S[E].ny*S[E].size;var y=ot(a,f),_=ot(a,f);if(_>=8192)throw"Something is wrong with PIZ_COMPRESSION BITMAP_SIZE";if(y<=_)for(var E=0;E<_-y+1;E++)g[E+y]=et(a,f);var x=new Uint16Array(65536),w=K(g,x),ae=Ee(a,f);Qt(n.array,a,f,ae,m,A);for(var E=0;E<n.channels;++E)for(var L=S[E],U=0;U<S[E].size;++U)Wn(m,L.start+U,L.nx,L.size,L.ny,L.nx*L.size,w);Xn(x,m,A);for(var B=0,H=new Uint8Array(m.buffer.byteLength),q=0;q<n.lines;q++)for(var $=0;$<n.channels;$++){var L=S[$],le=L.nx*L.size,Ae=new Uint8Array(m.buffer,L.end*2,le*2);H.set(Ae,B),B+=le*2,L.end+=le}return new DataView(H.buffer)}function sr(n){var a=n.array.slice(n.offset.value,n.offset.value+n.size),f=wt(a);const m=n.lines*n.channels*n.width,g=n.type==1?new Uint16Array(m):new Uint32Array(m);let A=0,S=0;const E=new Array(4);for(let y=0;y<n.lines;y++)for(let _=0;_<n.channels;_++){let x=0;switch(n.type){case 1:E[0]=A,E[1]=E[0]+n.width,A=E[1]+n.width;for(let w=0;w<n.width;++w){const ae=f[E[0]++]<<8|f[E[1]++];x+=ae,g[S]=x,S++}break;case 2:E[0]=A,E[1]=E[0]+n.width,E[2]=E[1]+n.width,A=E[2]+n.width;for(let w=0;w<n.width;++w){const ae=f[E[0]++]<<24|f[E[1]++]<<16|f[E[2]++]<<8;x+=ae,g[S]=x,S++}break}}return new DataView(g.buffer)}function nn(n){var a=n.viewer,f={value:n.offset.value},m=new Uint8Array(n.width*n.lines*(n.channels*n.type*2)),g={version:we(a,f),unknownUncompressedSize:we(a,f),unknownCompressedSize:we(a,f),acCompressedSize:we(a,f),dcCompressedSize:we(a,f),rleCompressedSize:we(a,f),rleUncompressedSize:we(a,f),rleRawSize:we(a,f),totalAcUncompressedCount:we(a,f),totalDcUncompressedCount:we(a,f),acCompression:we(a,f)};if(g.version<2)throw"EXRLoader.parse: "+ct.compression+" version "+g.version+" is unsupported";for(var A=new Array,S=ot(a,f)-2;S>0;){var E=Et(a.buffer,f),y=et(a,f),_=y>>2&3,x=(y>>4)-1,w=new Int8Array([x])[0],ae=et(a,f);A.push({name:E,index:w,type:ae,compression:_}),S-=E.length+3}for(var L=ct.channels,U=new Array(n.channels),B=0;B<n.channels;++B){var H=U[B]={},q=L[B];H.name=q.name,H.compression=0,H.decoded=!1,H.type=q.pixelType,H.pLinear=q.pLinear,H.width=n.width,H.height=n.lines}for(var $={idx:new Array(3)},le=0;le<n.channels;++le)for(var H=U[le],B=0;B<A.length;++B){var Ae=A[B];H.name==Ae.name&&(H.compression=Ae.compression,Ae.index>=0&&($.idx[Ae.index]=le),H.offset=le)}if(g.acCompressedSize>0)switch(g.acCompression){case 0:var te=new Uint16Array(g.totalAcUncompressedCount);Qt(n.array,a,f,g.acCompressedSize,te,g.totalAcUncompressedCount);break;case 1:var J=n.array.slice(f.value,f.value+g.totalAcUncompressedCount),Ue=wt(J),te=new Uint16Array(Ue.buffer);f.value+=g.totalAcUncompressedCount;break}if(g.dcCompressedSize>0){var fe={array:n.array,offset:f,size:g.dcCompressedSize},He=new Uint16Array(Lt(fe).buffer);f.value+=g.dcCompressedSize}if(g.rleRawSize>0){var J=n.array.slice(f.value,f.value+g.rleCompressedSize),Ue=wt(J),lt=en(Ue.buffer);f.value+=g.rleCompressedSize}for(var _e=0,Y=new Array(U.length),B=0;B<Y.length;++B)Y[B]=new Array;for(var ge=0;ge<n.lines;++ge)for(var ie=0;ie<U.length;++ie)Y[ie].push(_e),_e+=U[ie].width*n.type*2;qn($,Y,U,te,He,m);for(var B=0;B<U.length;++B){var H=U[B];if(!H.decoded)switch(H.compression){case 2:for(var V=0,ye=0,ge=0;ge<n.lines;++ge){for(var Xe=Y[B][V],Se=0;Se<H.width;++Se){for(var ze=0;ze<2*H.type;++ze)m[Xe++]=lt[ye+ze*H.width*H.height];ye++}V++}break;case 1:default:throw"EXRLoader.parse: unsupported channel compression"}}return new DataView(m.buffer)}function Et(n,a){for(var f=new Uint8Array(n),m=0;f[a.value+m]!=0;)m+=1;var g=new TextDecoder().decode(f.slice(a.value,a.value+m));return a.value=a.value+m+1,g}function ir(n,a,f){var m=new TextDecoder().decode(new Uint8Array(n).slice(a.value,a.value+f));return a.value=a.value+f,m}function or(n,a){var f=it(n,a),m=Ee(n,a);return[f,m]}function ar(n,a){var f=Ee(n,a),m=Ee(n,a);return[f,m]}function it(n,a){var f=n.getInt32(a.value,!0);return a.value=a.value+4,f}function Ee(n,a){var f=n.getUint32(a.value,!0);return a.value=a.value+4,f}function rn(n,a){var f=n[a.value];return a.value=a.value+1,f}function et(n,a){var f=n.getUint8(a.value);return a.value=a.value+1,f}const we=function(n,a){let f;return"getBigInt64"in DataView.prototype?f=Number(n.getBigInt64(a.value,!0)):f=n.getUint32(a.value+4,!0)+Number(n.getUint32(a.value,!0)<<32),a.value+=8,f};function ve(n,a){var f=n.getFloat32(a.value,!0);return a.value+=4,f}function cr(n,a){return tt.toHalfFloat(ve(n,a))}function b(n){var a=(n&31744)>>10,f=n&1023;return(n>>15?-1:1)*(a?a===31?f?NaN:1/0:Math.pow(2,a-15)*(1+f/1024):6103515625e-14*(f/1024))}function ot(n,a){var f=n.getUint16(a.value,!0);return a.value+=2,f}function lr(n,a){return b(ot(n,a))}function ur(n,a,f,m){for(var g=f.value,A=[];f.value<g+m-1;){var S=Et(a,f),E=it(n,f),y=et(n,f);f.value+=3;var _=it(n,f),x=it(n,f);A.push({name:S,pixelType:E,pLinear:y,xSampling:_,ySampling:x})}return f.value+=1,A}function fr(n,a){var f=ve(n,a),m=ve(n,a),g=ve(n,a),A=ve(n,a),S=ve(n,a),E=ve(n,a),y=ve(n,a),_=ve(n,a);return{redX:f,redY:m,greenX:g,greenY:A,blueX:S,blueY:E,whiteX:y,whiteY:_}}function hr(n,a){var f=["NO_COMPRESSION","RLE_COMPRESSION","ZIPS_COMPRESSION","ZIP_COMPRESSION","PIZ_COMPRESSION","PXR24_COMPRESSION","B44_COMPRESSION","B44A_COMPRESSION","DWAA_COMPRESSION","DWAB_COMPRESSION"],m=et(n,a);return f[m]}function dr(n,a){var f=Ee(n,a),m=Ee(n,a),g=Ee(n,a),A=Ee(n,a);return{xMin:f,yMin:m,xMax:g,yMax:A}}function pr(n,a){var f=["INCREASING_Y"],m=et(n,a);return f[m]}function mr(n,a){var f=ve(n,a),m=ve(n,a);return[f,m]}function vr(n,a){var f=ve(n,a),m=ve(n,a),g=ve(n,a);return[f,m,g]}function gr(n,a,f,m,g){if(m==="string"||m==="stringvector"||m==="iccProfile")return ir(a,f,g);if(m==="chlist")return ur(n,a,f,g);if(m==="chromaticities")return fr(n,f);if(m==="compression")return hr(n,f);if(m==="box2i")return dr(n,f);if(m==="lineOrder")return pr(n,f);if(m==="float")return ve(n,f);if(m==="v2f")return mr(n,f);if(m==="v3f")return vr(n,f);if(m==="int")return it(n,f);if(m==="rational")return or(n,f);if(m==="timecode")return ar(n,f);if(m==="preview")return f.value+=g,"skipped";f.value+=g}function Ar(n,a,f){const m={};if(n.getUint32(0,!0)!=20000630)throw"THREE.EXRLoader: provided file doesn't appear to be in OpenEXR format.";m.version=n.getUint8(4);const g=n.getUint8(5);m.spec={singleTile:!!(g&2),longName:!!(g&4),deepFormat:!!(g&8),multiPart:!!(g&16)},f.value=8;for(var A=!0;A;){var S=Et(a,f);if(S==0)A=!1;else{var E=Et(a,f),y=Ee(n,f),_=gr(n,a,f,E,y);_===void 0?console.warn(`EXRLoader.parse: skipped unknown header attribute type '${E}'.`):m[S]=_}}if(g&-5)throw console.error("EXRHeader:",m),"THREE.EXRLoader: provided file is currently unsupported.";return m}function Tr(n,a,f,m,g){const A={size:0,viewer:a,array:f,offset:m,width:n.dataWindow.xMax-n.dataWindow.xMin+1,height:n.dataWindow.yMax-n.dataWindow.yMin+1,channels:n.channels.length,bytesPerLine:null,lines:null,inputSize:null,type:n.channels[0].pixelType,uncompress:null,getter:null,format:null,[ht?"colorSpace":"encoding"]:null};switch(n.compression){case"NO_COMPRESSION":A.lines=1,A.uncompress=tn;break;case"RLE_COMPRESSION":A.lines=1,A.uncompress=nr;break;case"ZIPS_COMPRESSION":A.lines=1,A.uncompress=Lt;break;case"ZIP_COMPRESSION":A.lines=16,A.uncompress=Lt;break;case"PIZ_COMPRESSION":A.lines=32,A.uncompress=rr;break;case"PXR24_COMPRESSION":A.lines=16,A.uncompress=sr;break;case"DWAA_COMPRESSION":A.lines=32,A.uncompress=nn;break;case"DWAB_COMPRESSION":A.lines=256,A.uncompress=nn;break;default:throw"EXRLoader.parse: "+n.compression+" is unsupported"}if(A.scanlineBlockSize=A.lines,A.type==1)switch(g){case nt:A.getter=lr,A.inputSize=2;break;case Ze:A.getter=ot,A.inputSize=2;break}else if(A.type==2)switch(g){case nt:A.getter=ve,A.inputSize=4;break;case Ze:A.getter=cr,A.inputSize=4}else throw"EXRLoader.parse: unsupported pixelType "+A.type+" for "+n.compression+".";A.blockCount=(n.dataWindow.yMax+1)/A.scanlineBlockSize;for(var S=0;S<A.blockCount;S++)we(a,m);A.outputChannels=A.channels==3?4:A.channels;const E=A.width*A.height*A.outputChannels;switch(g){case nt:A.byteArray=new Float32Array(E),A.channels<A.outputChannels&&A.byteArray.fill(1,0,E);break;case Ze:A.byteArray=new Uint16Array(E),A.channels<A.outputChannels&&A.byteArray.fill(15360,0,E);break;default:console.error("THREE.EXRLoader: unsupported type: ",g);break}return A.bytesPerLine=A.width*A.inputSize*A.channels,A.outputChannels==4?A.format=ts:A.format=ns,ht?A.colorSpace="srgb-linear":A.encoding=3e3,A}const St=new DataView(e),Er=new Uint8Array(e),at={value:0},ct=Ar(St,e,at),z=Tr(ct,St,Er,at,this.type),sn={value:0},Sr={R:0,G:1,B:2,A:3,Y:0};for(let n=0;n<z.height/z.scanlineBlockSize;n++){const a=Ee(St,at);z.size=Ee(St,at),z.lines=a+z.scanlineBlockSize>z.height?z.height-a:z.scanlineBlockSize;const m=z.size<z.lines*z.bytesPerLine?z.uncompress(z):tn(z);at.value+=z.size;for(let g=0;g<z.scanlineBlockSize;g++){const A=g+n*z.scanlineBlockSize;if(A>=z.height)break;for(let S=0;S<z.channels;S++){const E=Sr[ct.channels[S].name];for(let y=0;y<z.width;y++){sn.value=(g*(z.channels*z.width)+S*z.width+y)*z.inputSize;const _=(z.height-1-A)*(z.width*z.outputChannels)+y*z.outputChannels+E;z.byteArray[_]=z.getter(m,sn)}}}}return{header:ct,width:z.width,height:z.height,data:z.byteArray,format:z.format,[ht?"colorSpace":"encoding"]:z[ht?"colorSpace":"encoding"],type:this.type}}setDataType(e){return this.type=e,this}load(e,t,s,r){function o(i,l){ht?i.colorSpace=l.colorSpace:i.encoding=l.encoding,i.minFilter=Je,i.magFilter=Je,i.generateMipmaps=!1,i.flipY=!1,t&&t(i,l)}return super.load(e,o,s,r)}}const An=new Mt,_t=new Te;class ei extends rs{constructor(){super(),this.isLineSegmentsGeometry=!0,this.type="LineSegmentsGeometry";const e=[-1,2,0,1,2,0,-1,1,0,1,1,0,-1,0,0,1,0,0,-1,-1,0,1,-1,0],t=[-1,2,1,2,-1,1,1,1,-1,-1,1,-1,-1,-2,1,-2],s=[0,2,1,2,3,1,2,4,3,4,5,3,4,6,5,6,7,5];this.setIndex(s),this.setAttribute("position",new fn(e,3)),this.setAttribute("uv",new fn(t,2))}applyMatrix4(e){const t=this.attributes.instanceStart,s=this.attributes.instanceEnd;return t!==void 0&&(t.applyMatrix4(e),s.applyMatrix4(e),t.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}setPositions(e){let t;e instanceof Float32Array?t=e:Array.isArray(e)&&(t=new Float32Array(e));const s=new Kt(t,6,1);return this.setAttribute("instanceStart",new Ye(s,3,0)),this.setAttribute("instanceEnd",new Ye(s,3,3)),this.instanceCount=this.attributes.instanceStart.count,this.computeBoundingBox(),this.computeBoundingSphere(),this}setColors(e){let t;e instanceof Float32Array?t=e:Array.isArray(e)&&(t=new Float32Array(e));const s=new Kt(t,6,1);return this.setAttribute("instanceColorStart",new Ye(s,3,0)),this.setAttribute("instanceColorEnd",new Ye(s,3,3)),this}fromWireframeGeometry(e){return this.setPositions(e.attributes.position.array),this}fromEdgesGeometry(e){return this.setPositions(e.attributes.position.array),this}fromMesh(e){return this.fromWireframeGeometry(new ss(e.geometry)),this}fromLineSegments(e){const t=e.geometry;return this.setPositions(t.attributes.position.array),this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new Mt);const e=this.attributes.instanceStart,t=this.attributes.instanceEnd;e!==void 0&&t!==void 0&&(this.boundingBox.setFromBufferAttribute(e),An.setFromBufferAttribute(t),this.boundingBox.union(An))}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new Yt),this.boundingBox===null&&this.computeBoundingBox();const e=this.attributes.instanceStart,t=this.attributes.instanceEnd;if(e!==void 0&&t!==void 0){const s=this.boundingSphere.center;this.boundingBox.getCenter(s);let r=0;for(let o=0,i=e.count;o<i;o++)_t.fromBufferAttribute(e,o),r=Math.max(r,s.distanceToSquared(_t)),_t.fromBufferAttribute(t,o),r=Math.max(r,s.distanceToSquared(_t));this.boundingSphere.radius=Math.sqrt(r),isNaN(this.boundingSphere.radius)&&console.error("THREE.LineSegmentsGeometry.computeBoundingSphere(): Computed radius is NaN. The instanced position data is likely to have NaN values.",this)}}toJSON(){}applyMatrix(e){return console.warn("THREE.LineSegmentsGeometry: applyMatrix() has been renamed to applyMatrix4()."),this.applyMatrix4(e)}}It.line={worldUnits:{value:1},linewidth:{value:1},resolution:{value:new Xt(1,1)},dashOffset:{value:0},dashScale:{value:1},dashSize:{value:1},gapSize:{value:1}};Rt.line={uniforms:Bn.merge([It.common,It.fog,It.line]),vertexShader:`
		#include <common>
		#include <color_pars_vertex>
		#include <fog_pars_vertex>
		#include <logdepthbuf_pars_vertex>
		#include <clipping_planes_pars_vertex>

		uniform float linewidth;
		uniform vec2 resolution;

		attribute vec3 instanceStart;
		attribute vec3 instanceEnd;

		attribute vec3 instanceColorStart;
		attribute vec3 instanceColorEnd;

		#ifdef WORLD_UNITS

			varying vec4 worldPos;
			varying vec3 worldStart;
			varying vec3 worldEnd;

			#ifdef USE_DASH

				varying vec2 vUv;

			#endif

		#else

			varying vec2 vUv;

		#endif

		#ifdef USE_DASH

			uniform float dashScale;
			attribute float instanceDistanceStart;
			attribute float instanceDistanceEnd;
			varying float vLineDistance;

		#endif

		void trimSegment( const in vec4 start, inout vec4 end ) {

			// trim end segment so it terminates between the camera plane and the near plane

			// conservative estimate of the near plane
			float a = projectionMatrix[ 2 ][ 2 ]; // 3nd entry in 3th column
			float b = projectionMatrix[ 3 ][ 2 ]; // 3nd entry in 4th column
			float nearEstimate = - 0.5 * b / a;

			float alpha = ( nearEstimate - start.z ) / ( end.z - start.z );

			end.xyz = mix( start.xyz, end.xyz, alpha );

		}

		void main() {

			#ifdef USE_COLOR

				vColor.xyz = ( position.y < 0.5 ) ? instanceColorStart : instanceColorEnd;

			#endif

			#ifdef USE_DASH

				vLineDistance = ( position.y < 0.5 ) ? dashScale * instanceDistanceStart : dashScale * instanceDistanceEnd;
				vUv = uv;

			#endif

			float aspect = resolution.x / resolution.y;

			// camera space
			vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );
			vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );

			#ifdef WORLD_UNITS

				worldStart = start.xyz;
				worldEnd = end.xyz;

			#else

				vUv = uv;

			#endif

			// special case for perspective projection, and segments that terminate either in, or behind, the camera plane
			// clearly the gpu firmware has a way of addressing this issue when projecting into ndc space
			// but we need to perform ndc-space calculations in the shader, so we must address this issue directly
			// perhaps there is a more elegant solution -- WestLangley

			bool perspective = ( projectionMatrix[ 2 ][ 3 ] == - 1.0 ); // 4th entry in the 3rd column

			if ( perspective ) {

				if ( start.z < 0.0 && end.z >= 0.0 ) {

					trimSegment( start, end );

				} else if ( end.z < 0.0 && start.z >= 0.0 ) {

					trimSegment( end, start );

				}

			}

			// clip space
			vec4 clipStart = projectionMatrix * start;
			vec4 clipEnd = projectionMatrix * end;

			// ndc space
			vec3 ndcStart = clipStart.xyz / clipStart.w;
			vec3 ndcEnd = clipEnd.xyz / clipEnd.w;

			// direction
			vec2 dir = ndcEnd.xy - ndcStart.xy;

			// account for clip-space aspect ratio
			dir.x *= aspect;
			dir = normalize( dir );

			#ifdef WORLD_UNITS

				vec3 worldDir = normalize( end.xyz - start.xyz );
				vec3 tmpFwd = normalize( mix( start.xyz, end.xyz, 0.5 ) );
				vec3 worldUp = normalize( cross( worldDir, tmpFwd ) );
				vec3 worldFwd = cross( worldDir, worldUp );
				worldPos = position.y < 0.5 ? start: end;

				// height offset
				float hw = linewidth * 0.5;
				worldPos.xyz += position.x < 0.0 ? hw * worldUp : - hw * worldUp;

				// don't extend the line if we're rendering dashes because we
				// won't be rendering the endcaps
				#ifndef USE_DASH

					// cap extension
					worldPos.xyz += position.y < 0.5 ? - hw * worldDir : hw * worldDir;

					// add width to the box
					worldPos.xyz += worldFwd * hw;

					// endcaps
					if ( position.y > 1.0 || position.y < 0.0 ) {

						worldPos.xyz -= worldFwd * 2.0 * hw;

					}

				#endif

				// project the worldpos
				vec4 clip = projectionMatrix * worldPos;

				// shift the depth of the projected points so the line
				// segments overlap neatly
				vec3 clipPose = ( position.y < 0.5 ) ? ndcStart : ndcEnd;
				clip.z = clipPose.z * clip.w;

			#else

				vec2 offset = vec2( dir.y, - dir.x );
				// undo aspect ratio adjustment
				dir.x /= aspect;
				offset.x /= aspect;

				// sign flip
				if ( position.x < 0.0 ) offset *= - 1.0;

				// endcaps
				if ( position.y < 0.0 ) {

					offset += - dir;

				} else if ( position.y > 1.0 ) {

					offset += dir;

				}

				// adjust for linewidth
				offset *= linewidth;

				// adjust for clip-space to screen-space conversion // maybe resolution should be based on viewport ...
				offset /= resolution.y;

				// select end
				vec4 clip = ( position.y < 0.5 ) ? clipStart : clipEnd;

				// back to clip space
				offset *= clip.w;

				clip.xy += offset;

			#endif

			gl_Position = clip;

			vec4 mvPosition = ( position.y < 0.5 ) ? start : end; // this is an approximation

			#include <logdepthbuf_vertex>
			#include <clipping_planes_vertex>
			#include <fog_vertex>

		}
		`,fragmentShader:`
		uniform vec3 diffuse;
		uniform float opacity;
		uniform float linewidth;

		#ifdef USE_DASH

			uniform float dashOffset;
			uniform float dashSize;
			uniform float gapSize;

		#endif

		varying float vLineDistance;

		#ifdef WORLD_UNITS

			varying vec4 worldPos;
			varying vec3 worldStart;
			varying vec3 worldEnd;

			#ifdef USE_DASH

				varying vec2 vUv;

			#endif

		#else

			varying vec2 vUv;

		#endif

		#include <common>
		#include <color_pars_fragment>
		#include <fog_pars_fragment>
		#include <logdepthbuf_pars_fragment>
		#include <clipping_planes_pars_fragment>

		vec2 closestLineToLine(vec3 p1, vec3 p2, vec3 p3, vec3 p4) {

			float mua;
			float mub;

			vec3 p13 = p1 - p3;
			vec3 p43 = p4 - p3;

			vec3 p21 = p2 - p1;

			float d1343 = dot( p13, p43 );
			float d4321 = dot( p43, p21 );
			float d1321 = dot( p13, p21 );
			float d4343 = dot( p43, p43 );
			float d2121 = dot( p21, p21 );

			float denom = d2121 * d4343 - d4321 * d4321;

			float numer = d1343 * d4321 - d1321 * d4343;

			mua = numer / denom;
			mua = clamp( mua, 0.0, 1.0 );
			mub = ( d1343 + d4321 * ( mua ) ) / d4343;
			mub = clamp( mub, 0.0, 1.0 );

			return vec2( mua, mub );

		}

		void main() {

			#include <clipping_planes_fragment>

			#ifdef USE_DASH

				if ( vUv.y < - 1.0 || vUv.y > 1.0 ) discard; // discard endcaps

				if ( mod( vLineDistance + dashOffset, dashSize + gapSize ) > dashSize ) discard; // todo - FIX

			#endif

			float alpha = opacity;

			#ifdef WORLD_UNITS

				// Find the closest points on the view ray and the line segment
				vec3 rayEnd = normalize( worldPos.xyz ) * 1e5;
				vec3 lineDir = worldEnd - worldStart;
				vec2 params = closestLineToLine( worldStart, worldEnd, vec3( 0.0, 0.0, 0.0 ), rayEnd );

				vec3 p1 = worldStart + lineDir * params.x;
				vec3 p2 = rayEnd * params.y;
				vec3 delta = p1 - p2;
				float len = length( delta );
				float norm = len / linewidth;

				#ifndef USE_DASH

					#ifdef USE_ALPHA_TO_COVERAGE

						float dnorm = fwidth( norm );
						alpha = 1.0 - smoothstep( 0.5 - dnorm, 0.5 + dnorm, norm );

					#else

						if ( norm > 0.5 ) {

							discard;

						}

					#endif

				#endif

			#else

				#ifdef USE_ALPHA_TO_COVERAGE

					// artifacts appear on some hardware if a derivative is taken within a conditional
					float a = vUv.x;
					float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
					float len2 = a * a + b * b;
					float dlen = fwidth( len2 );

					if ( abs( vUv.y ) > 1.0 ) {

						alpha = 1.0 - smoothstep( 1.0 - dlen, 1.0 + dlen, len2 );

					}

				#else

					if ( abs( vUv.y ) > 1.0 ) {

						float a = vUv.x;
						float b = ( vUv.y > 0.0 ) ? vUv.y - 1.0 : vUv.y + 1.0;
						float len2 = a * a + b * b;

						if ( len2 > 1.0 ) discard;

					}

				#endif

			#endif

			vec4 diffuseColor = vec4( diffuse, alpha );

			#include <logdepthbuf_fragment>
			#include <color_fragment>

			gl_FragColor = vec4( diffuseColor.rgb, alpha );

			#include <tonemapping_fragment>
			#include <colorspace_fragment>
			#include <fog_fragment>
			#include <premultiplied_alpha_fragment>

		}
		`};class ti extends Dn{static get type(){return"LineMaterial"}constructor(e){super({uniforms:Bn.clone(Rt.line.uniforms),vertexShader:Rt.line.vertexShader,fragmentShader:Rt.line.fragmentShader,clipping:!0}),this.isLineMaterial=!0,this.setValues(e)}get color(){return this.uniforms.diffuse.value}set color(e){this.uniforms.diffuse.value=e}get worldUnits(){return"WORLD_UNITS"in this.defines}set worldUnits(e){e===!0?this.defines.WORLD_UNITS="":delete this.defines.WORLD_UNITS}get linewidth(){return this.uniforms.linewidth.value}set linewidth(e){this.uniforms.linewidth&&(this.uniforms.linewidth.value=e)}get dashed(){return"USE_DASH"in this.defines}set dashed(e){e===!0!==this.dashed&&(this.needsUpdate=!0),e===!0?this.defines.USE_DASH="":delete this.defines.USE_DASH}get dashScale(){return this.uniforms.dashScale.value}set dashScale(e){this.uniforms.dashScale.value=e}get dashSize(){return this.uniforms.dashSize.value}set dashSize(e){this.uniforms.dashSize.value=e}get dashOffset(){return this.uniforms.dashOffset.value}set dashOffset(e){this.uniforms.dashOffset.value=e}get gapSize(){return this.uniforms.gapSize.value}set gapSize(e){this.uniforms.gapSize.value=e}get opacity(){return this.uniforms.opacity.value}set opacity(e){this.uniforms&&(this.uniforms.opacity.value=e)}get resolution(){return this.uniforms.resolution.value}set resolution(e){this.uniforms.resolution.value.copy(e)}get alphaToCoverage(){return"USE_ALPHA_TO_COVERAGE"in this.defines}set alphaToCoverage(e){this.defines&&(e===!0!==this.alphaToCoverage&&(this.needsUpdate=!0),e===!0?this.defines.USE_ALPHA_TO_COVERAGE="":delete this.defines.USE_ALPHA_TO_COVERAGE)}}const Ht=new At,Tn=new Te,En=new Te,de=new At,pe=new At,Ne=new At,kt=new Te,Pt=new gt,me=new is,Sn=new Te,yt=new Mt,xt=new Yt,Ce=new At;let De,Qe;function wn(d,e,t){return Ce.set(0,0,-e,1).applyMatrix4(d.projectionMatrix),Ce.multiplyScalar(1/Ce.w),Ce.x=Qe/t.width,Ce.y=Qe/t.height,Ce.applyMatrix4(d.projectionMatrixInverse),Ce.multiplyScalar(1/Ce.w),Math.abs(Math.max(Ce.x,Ce.y))}function ni(d,e){const t=d.matrixWorld,s=d.geometry,r=s.attributes.instanceStart,o=s.attributes.instanceEnd,i=Math.min(s.instanceCount,r.count);for(let l=0,c=i;l<c;l++){me.start.fromBufferAttribute(r,l),me.end.fromBufferAttribute(o,l),me.applyMatrix4(t);const u=new Te,h=new Te;De.distanceSqToSegment(me.start,me.end,h,u),h.distanceTo(u)<Qe*.5&&e.push({point:h,pointOnLine:u,distance:De.origin.distanceTo(h),object:d,face:null,faceIndex:l,uv:null,uv1:null})}}function ri(d,e,t){const s=e.projectionMatrix,o=d.material.resolution,i=d.matrixWorld,l=d.geometry,c=l.attributes.instanceStart,u=l.attributes.instanceEnd,h=Math.min(l.instanceCount,c.count),p=-e.near;De.at(1,Ne),Ne.w=1,Ne.applyMatrix4(e.matrixWorldInverse),Ne.applyMatrix4(s),Ne.multiplyScalar(1/Ne.w),Ne.x*=o.x/2,Ne.y*=o.y/2,Ne.z=0,kt.copy(Ne),Pt.multiplyMatrices(e.matrixWorldInverse,i);for(let v=0,T=h;v<T;v++){if(de.fromBufferAttribute(c,v),pe.fromBufferAttribute(u,v),de.w=1,pe.w=1,de.applyMatrix4(Pt),pe.applyMatrix4(Pt),de.z>p&&pe.z>p)continue;if(de.z>p){const Z=de.z-pe.z,D=(de.z-p)/Z;de.lerp(pe,D)}else if(pe.z>p){const Z=pe.z-de.z,D=(pe.z-p)/Z;pe.lerp(de,D)}de.applyMatrix4(s),pe.applyMatrix4(s),de.multiplyScalar(1/de.w),pe.multiplyScalar(1/pe.w),de.x*=o.x/2,de.y*=o.y/2,pe.x*=o.x/2,pe.y*=o.y/2,me.start.copy(de),me.start.z=0,me.end.copy(pe),me.end.z=0;const C=me.closestPointToPointParameter(kt,!0);me.at(C,Sn);const R=Nn.lerp(de.z,pe.z,C),N=R>=-1&&R<=1,G=kt.distanceTo(Sn)<Qe*.5;if(N&&G){me.start.fromBufferAttribute(c,v),me.end.fromBufferAttribute(u,v),me.start.applyMatrix4(i),me.end.applyMatrix4(i);const Z=new Te,D=new Te;De.distanceSqToSegment(me.start,me.end,D,Z),t.push({point:D,pointOnLine:Z,distance:De.origin.distanceTo(D),object:d,face:null,faceIndex:v,uv:null,uv1:null})}}}class pi extends qt{constructor(e=new ei,t=new ti({color:Math.random()*16777215})){super(e,t),this.isLineSegments2=!0,this.type="LineSegments2"}computeLineDistances(){const e=this.geometry,t=e.attributes.instanceStart,s=e.attributes.instanceEnd,r=new Float32Array(2*t.count);for(let i=0,l=0,c=t.count;i<c;i++,l+=2)Tn.fromBufferAttribute(t,i),En.fromBufferAttribute(s,i),r[l]=l===0?0:r[l-1],r[l+1]=r[l]+Tn.distanceTo(En);const o=new Kt(r,2,1);return e.setAttribute("instanceDistanceStart",new Ye(o,1,0)),e.setAttribute("instanceDistanceEnd",new Ye(o,1,1)),this}raycast(e,t){const s=this.material.worldUnits,r=e.camera;r===null&&!s&&console.error('LineSegments2: "Raycaster.camera" needs to be set in order to raycast against LineSegments2 while worldUnits is set to false.');const o=e.params.Line2!==void 0&&e.params.Line2.threshold||0;De=e.ray;const i=this.matrixWorld,l=this.geometry,c=this.material;Qe=c.linewidth+o,l.boundingSphere===null&&l.computeBoundingSphere(),xt.copy(l.boundingSphere).applyMatrix4(i);let u;if(s)u=Qe*.5;else{const p=Math.max(r.near,xt.distanceToPoint(De.origin));u=wn(r,p,c.resolution)}if(xt.radius+=u,De.intersectsSphere(xt)===!1)return;l.boundingBox===null&&l.computeBoundingBox(),yt.copy(l.boundingBox).applyMatrix4(i);let h;if(s)h=Qe*.5;else{const p=Math.max(r.near,yt.distanceToPoint(De.origin));h=wn(r,p,c.resolution)}yt.expandByScalar(h),De.intersectsBox(yt)!==!1&&(s?ni(this,t):ri(this,r,t))}onBeforeRender(e){const t=this.material.uniforms;t&&t.resolution&&(e.getViewport(Ht),this.material.uniforms.resolution.value.set(Ht.z,Ht.w))}}export{di as E,ai as G,ui as H,ei as L,hi as R,fi as V,li as a,ti as b,pi as c,ci as i,oi as m};
