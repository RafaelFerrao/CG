
import * as twgl from "/twgl-full.module.js";
import { parseOBJ, parseMTL } from "/obj-parser.js";
import { getGeometriesExtents, shallowCopy } from "/utils.js";

"use strict";

const vs = `#version 300 es
in vec4 a_position;
in vec3 a_normal;
in vec4 a_color;

uniform mat4 u_world;
uniform mat4 u_projection;
uniform mat4 u_view;
uniform vec3 u_viewWorldPosition;

out vec4 v_position;
out vec3 v_surfaceToView;
out vec4 v_color;

void main() {
  vec4 worldPosition = u_world * a_position;
  gl_Position = u_projection * u_view * worldPosition;
  v_surfaceToView = u_viewWorldPosition - worldPosition.xyz;
  v_position = a_position;
  v_color = a_color;
}
`;

const fs = `#version 300 es
precision highp float;

in vec4 v_position;
in vec3 v_surfaceToView;
in vec4 v_color;

uniform mat4 u_world;
uniform vec3 diffuse;
uniform vec3 ambient;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
uniform vec3 u_lightDirection;
uniform vec3 u_ambientLight;

out vec4 outColor;

vec3 calculateScreenSpaceNormal(vec4 p) {
    vec3 dx = dFdx(p.xyz);
    vec3 dy = dFdy(p.xyz);
    return normalize(cross(dx, dy));
}

void main () {
  vec3 normalA = calculateScreenSpaceNormal(v_position);
  vec3 normal = normalize(mat3(u_world) * normalA);

  vec3 surfaceToViewDirection = normalize(v_surfaceToView);
  vec3 halfVector = normalize(u_lightDirection + surfaceToViewDirection);

  float fakeLight = dot(u_lightDirection, normal) * .5 + .5;
  float specularLight = clamp(dot(normal, halfVector), 0.0, 1.0);

  vec3 effectiveDiffuse = diffuse.rgb * v_color.rgb;
  float effectiveOpacity = v_color.a * opacity;

  outColor = vec4(
      emissive +
      ambient * u_ambientLight +
      effectiveDiffuse * fakeLight +
      specular * pow(specularLight, shininess),
      effectiveOpacity);
}
`;


async function main() {

    const canvas = document.querySelector("#canvas");
    const gl = canvas.getContext("webgl2");

    twgl.setAttributePrefix("a_");

    const programInfo = twgl.createProgramInfo(gl, [vs, fs]);

    class Model {
        static index = 0;

        constructor(modelName, path) {
            this.name = modelName;
            this.path = path;
            this.obj = null;
            this.parts = null;
            this.extents = null;
            this.range = null;
            this.objOffset = null;
            this.instances = 0;
            this.index = Model.index++;
        }

        async load() {
            const objHref = this.path;
            const response = await fetch(objHref);
            const text = await response.text();
            this.obj = parseOBJ(text);
            const baseHref = new URL(objHref, window.location.href);
            const matTexts = await Promise.all(this.obj.materialLibs.map(async filename => {
                const matHref = new URL(filename, baseHref).href;
                const response = await fetch(matHref);
                return await response.text();
            }));
            const materials = parseMTL(matTexts.join('\n'));

            this.parts = this.obj.geometries.map(({ material, data }) => {
                if (data.color) {
                    if (data.position.length === data.color.length) {
                        data.color = { numComponents: 3, data: data.color };
                    }
                } else {
                    data.color = { value: [1, 1, 1, 1] };
                }

                var bufferInfo = twgl.createBufferInfoFromArrays(gl, data);
                const vao = twgl.createVAOFromBufferInfo(gl, programInfo, bufferInfo);

                return {
                    material: materials[material],
                    bufferInfo,
                    vao,
                };
            });

            this.extents = getGeometriesExtents(this.obj.geometries);
            this.range = m4.subtractVectors(this.extents.max, this.extents.min);
            this.objOffset = m4.scaleVector(
                m4.addVectors(
                    this.extents.min,
                    m4.scaleVector(this.range, 0.5)),
                -1);
        }
    }

    class Object {
        constructor(model) {
            model.instances++;
            this.translation = [0, 0, 0];
            this.rotation = [0, 0, 0];
            this.scale = [1, 1, 1];
            this.materials = model.parts.map(part => {
                const material = shallowCopy(part.material);
                material.diffuse = material.diffuse.slice();
                return material;
            });
            this.modelIndex = model.index;
        }
    }

    function updateJson() {
        const jsonData = JSON.stringify(objectsToDraw);
        const jsonText = document.querySelector("#json-content");
        jsonText.value = jsonData;
    }

    function importScene() {
        const jsonText = document.querySelector("#json-content");
        const jsonData = JSON.parse(jsonText.value);

        //clear the dropdown
        dropdown.innerHTML = "";

        for (const key in jsonData) {
            objectsToDraw[key] = jsonData[key];
            const model = models[jsonData[key].modelIndex];
            model.instances++;
            const option = document.createElement("option", { value: key });
            option.value = key;
            option.text = key;
            dropdown.appendChild(option);
        }
    }

    const importButton = document.querySelector("#import-button");
    importButton.addEventListener('click', importScene);


    function addObject(model) {
        const key = model.name + (model.instances + 1);
        objectsToDraw[key] = new Object(model);
        const option = document.createElement("option", { value: key });
        option.value = key;
        option.text = key;
        dropdown.appendChild(option);
        updateJson();
    }


    var selectedObject = null;


    function updatePosition(index) {
        return function (event, ui) {
            selectedObject.translation[index] = ui.value * 0.01;
            updateJson()
        };
    }

    function updateRotation(index) {
        return function (event, ui) {
            var angleInDegrees = ui.value;
            var angleInRadians = degToRad(angleInDegrees);
            selectedObject.rotation[index] = angleInRadians;
            updateJson()
        };
    }

    function updateScale() {
        return function (event, ui) {
            selectedObject.scale = [ui.value, ui.value, ui.value];
            updateJson()
        };
    }

    function updateMaterial(index, colorIndex) {
        return function(event, ui) {
            const diffuse = selectedObject.materials[index].diffuse;
            diffuse[colorIndex] = ui.value;
            selectedObject.materials[index].diffuse[colorIndex] = ui.value;
            updateJson()
        };
    }

    function updateShininess(index) {
        return function (event, ui) {
            selectedObject.materials[index].shininess = ui.value;
            updateJson()
        }
    }


    const dropdown = document.querySelector("#object-selector");
    dropdown.addEventListener('click', function (event) {
        const key = event.target.value;
        selectedObject = objectsToDraw[key];
        console.log(selectedObject);

        webglLessonsUI.setupSlider("#x", { value: selectedObject.translation[0] * 100, slide: updatePosition(0), min: -500, max: 500 });
        webglLessonsUI.setupSlider("#y", { value: selectedObject.translation[1] * 100, slide: updatePosition(1), min: -500, max: 500 });
        webglLessonsUI.setupSlider("#z", { value: selectedObject.translation[2] * 100, slide: updatePosition(2), min: -1000, max: 1000 });
        webglLessonsUI.setupSlider("#angleX", { value: radToDeg(selectedObject.rotation[0]), slide: updateRotation(0), max: 360, step: 0.01, precision: 2 });
        webglLessonsUI.setupSlider("#angleY", { value: radToDeg(selectedObject.rotation[1]), slide: updateRotation(1), max: 360, step: 0.01, precision: 2 });
        webglLessonsUI.setupSlider("#angleZ", { value: radToDeg(selectedObject.rotation[2]), slide: updateRotation(2), max: 360, step: 0.01, precision: 2 });
        webglLessonsUI.setupSlider("#scale", { value: selectedObject.scale[0], slide: updateScale(), min: 0, max: 5, step: 0.01, precision: 2 });

        const divMaterial = document.querySelectorAll(".material");     
        divMaterial.forEach((div) => div.remove());

        const divLabel = document.querySelectorAll(".material-label");   
        divLabel.forEach((div) => div.remove());

        const ui = document.querySelector("#ui");

        selectedObject.materials.forEach((material, index) => {
            const label = document.createElement("div");
            label.className = ("gman-widget-outer material-label");
            label.innerText = "Part " + index;
            ui.appendChild(label);

            const diffuseR = document.createElement("div");
            diffuseR.id = `diffuseR${index}`;
            diffuseR.className = "material";
            ui.appendChild(diffuseR);
            webglLessonsUI.setupSlider(`#diffuseR${index}`, { value: material.diffuse[0], slide: updateMaterial(index, 0), min: 0, max: 1, step: 0.01, precision: 2 });

            const diffuseG = document.createElement("div");
            diffuseG.id = `diffuseG${index}`;
            diffuseG.className = "material";
            ui.appendChild(diffuseG);
            webglLessonsUI.setupSlider(`#diffuseG${index}`, { value: material.diffuse[1], slide: updateMaterial(index, 1), min: 0, max: 1, step: 0.01, precision: 2 });

            const diffuseB = document.createElement("div");
            diffuseB.id = `diffuseB${index}`;
            diffuseB.className = "material";
            ui.appendChild(diffuseB);
            webglLessonsUI.setupSlider(`#diffuseB${index}`, { value: material.diffuse[2], slide: updateMaterial(index, 2), min: 0, max: 1, step: 0.01, precision: 2 });

            const shininess = document.createElement("div");
            shininess.id = `shininess${index}`;
            shininess.className = "material";
            ui.appendChild(shininess);
            webglLessonsUI.setupSlider(`#shininess${index}`, { value: material.shininess, slide: updateShininess(index), min: 0, max: 999, step: 0.01, precision: 2 });
        });        
    });

    const models = [];

    const paths = [
        'models/tileHigh_desert.obj',
        'models/spikeRoller.obj',
        'models/swiper_teamBlue.obj',
        'models/swiperDouble_teamBlue.obj',
        'models/tree_desert.obj',
        'models/tileSlopeLowMedium_desert.obj',
        'models/tileSlopeMediumHigh_desert.obj'
    ];

    for (let i = 0; i < paths.length; ++i) {
        const url = paths[i];

        const regex = /\/(.*?)\./;
        const match = regex.exec(url);
        const name = match[1];

        const model = new Model(name, paths[i]);
        await model.load();
        models.push(model);
    }

    const objectsToDraw = {};


    function createElem(type, parent, className) {
        const elem = document.createElement(type);
        parent.appendChild(elem);
        if (className) {
            elem.className = className;
        }
        return elem;
    }

    const contentElem = document.querySelector('#content');
    const items = [];
    for (let i = 0; i < models.length; ++i) {
        const viewElem = createElem('div', contentElem, 'view');
        const { parts, objOffset, range } = models[i];

        viewElem.onclick = () => {
            console.log('clicked', models[i].name);
            addObject(models[i]);
        }

        items.push({
            parts,
            objOffset,
            range,
            element: viewElem,
        });
    }

    function degToRad(d) {
        return d * Math.PI / 180;
    }

    function radToDeg(r) {
        return r * 180 / Math.PI;
    }


    function setViewportAndScissor(rect) {
        const width = rect.right - rect.left;
        const height = rect.bottom - rect.top;
        const left = rect.left;
        const bottom = gl.canvas.clientHeight - rect.bottom - 1;

        gl.viewport(left, bottom, width, height);
        gl.scissor(left, bottom, width, height);

        return { width, height };
    }


    const fieldOfViewRadians = degToRad(55);

    function render(time) {
        time *= 0.001;

        twgl.resizeCanvasToDisplaySize(gl.canvas);

        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.enable(gl.SCISSOR_TEST);


        // Models list draw
        for (const { parts, objOffset, range, element } of items) {
            const rect = element.getBoundingClientRect();

            const { width, height } = setViewportAndScissor(rect);

            const radius = m4.length(range) * 1.2;

            const aspect = width / height;
            const near = radius / 100;
            const far = radius * 3;

            const projection = m4.perspective(fieldOfViewRadians, aspect, near, far);
            const cameraTarget = [0, 0, 0];
            const cameraPosition = m4.addVectors(cameraTarget, [
                0,
                0,
                radius,
            ]);
            const up = [0, 1, 0];
            const camera = m4.lookAt(cameraPosition, cameraTarget, up);
            let view = m4.inverse(camera);
            view = m4.translate(view, ...objOffset);
            const u_world = m4.yRotation(time);

            const sharedUniforms = {
                u_lightDirection: m4.normalize([-1, 3, 5]),
                u_projection: projection,
                u_viewWorldPosition: cameraPosition,
            };
            gl.useProgram(programInfo.program);

            twgl.setUniforms(programInfo, sharedUniforms);


            for (const { bufferInfo, vao, material } of parts) {
                gl.bindVertexArray(vao);

                twgl.setUniforms(programInfo, {
                    u_view: view,
                    u_world,
                }, material);

                twgl.drawBufferInfo(gl, bufferInfo);
            }
        }

        // Drawing the objects in the scene

        const scene = document.querySelector('#scene');
        const sceneRect = scene.getBoundingClientRect();

        const { width, height } = setViewportAndScissor(sceneRect);

        const aspect = width / height;
        const near = 1;
        const far = 2000;

        const projection = m4.perspective(fieldOfViewRadians, aspect, near, far);
        const cameraPosition = [2, 2, 6];
        const cameraTarget = [0, 0, 0];
        const up = [0, 1, 0];
        const camera = m4.lookAt(cameraPosition, cameraTarget, up);
        let view = m4.inverse(camera);


        const sharedUniforms = {
            u_lightDirection: m4.normalize([-1, 3, 5]),
            u_projection: projection,
            u_viewWorldPosition: cameraPosition,
        };
        gl.useProgram(programInfo.program);

        twgl.setUniforms(programInfo, sharedUniforms);



        for (const key in objectsToDraw) {

            let u_world = m4.identity();

            const object = objectsToDraw[key];
            const modelIndex = object.modelIndex;
            const model = models[modelIndex];
            const { parts, objOffset } = model;
            const { translation, rotation, scale, materials } = object;

            u_world = m4.translate(u_world, ...objOffset);
            u_world = m4.translate(u_world, translation[0], translation[1], translation[2]);
            u_world = m4.xRotate(u_world, rotation[0]);
            u_world = m4.yRotate(u_world, rotation[1]);
            u_world = m4.zRotate(u_world, rotation[2]);
            u_world = m4.scale(u_world, scale[0], scale[1], scale[2]);

            parts.forEach(({ bufferInfo, vao }, index) => {
                const material = materials[index];
                gl.bindVertexArray(vao);
            
                twgl.setUniforms(programInfo, {
                    u_view: view,
                    u_world,
                }, material);
            
                twgl.drawBufferInfo(gl, bufferInfo);
            });
            
        }
        requestAnimationFrame(render);

    }

    requestAnimationFrame(render);
}

main();
