
import * as twgl from "/twgl-full.module.js";
import { parseOBJ, parseMTL } from "/obj-parser.js";
import { getGeometriesExtents, shallowCopy } from "/utils.js";
import { toon_shader, phong_shader } from "/shaders.js";

"use strict";

async function main() {

    const canvas = document.querySelector("#canvas");
    const gl = canvas.getContext("webgl2");

    twgl.setAttributePrefix("a_");

    const toonProgramInfo = twgl.createProgramInfo(gl, toon_shader);
    const phongProgramInfo = twgl.createProgramInfo(gl, phong_shader);
    // const gouraudrogramInfo = twgl.createProgramInfo(gl, gouraud_shader);


    let programInfo = phongProgramInfo;

    class Model {
        static index = 0;

        constructor(path) {
            this.path = path;
            this.obj = null;
            this.parts = null;
            this.extents = null;
            this.range = null;
            this.objOffset = null;
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

            const defaultMaterial = {
                diffuse: [1, 1, 1, 1],
                ambient: [0, 0, 0],
                specular: [1, 1, 1],
                shininess: 400,
                opacity: 1,
              };

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
                    material: {
                        ...defaultMaterial,
                        ...materials[material],
                    },
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

    const objects = {
        'Skull': '/models/12140_Skull_v3_L2.obj',
        'Chair': 'https://webgl2fundamentals.org/webgl/resources/models/chair/chair.obj',
        'Book': 'https://webgl2fundamentals.org/webgl/resources/models/book-vertex-chameleon-study/book.obj',
        'Windmill': 'https://webgl2fundamentals.org/webgl/resources/models/windmill/windmill.obj',
        'Cube': '/models/cube.obj',
        'Hand': 'models/16834_hand_v1_NEW.obj',
        'Bunny': '/models/bunny.obj',
        'Statue': '/models/statue.obj',
        'Torus Knot': '/models/torus_knot.obj',
        'Ball': '/models/Football_ball.obj'
    }

    for (const key in objects) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = key;
        document.querySelector('#object-selector').appendChild(option);
    }


    // Default object
    let path = objects['Skull'];
    let model = new Model(path);
    await model.load();

    //Update model when object is selected from dropdown
    document.querySelector('#object-selector').addEventListener('change', async function (event) {
        path = objects[event.target.value];
        let new_model = new Model(path);
        await new_model.load();
        model = new_model;
    });

    // Default shader
    let selectedShader = 'phong';

    //Update shader when shader is selected from dropdown
    document.querySelector('#shader-selector').addEventListener('change', function (event) {
        console.log(event.target.value);
        selectedShader = event.target.value;
    });



    function degToRad(d) {
        return d * Math.PI / 180;
    }

    function drawScene(worldMatrix, bufferInfo, vao, material, programInfo) {
        gl.bindVertexArray(vao);
        twgl.setUniforms(programInfo, {
            u_world: worldMatrix,
        }, material);
        twgl.drawBufferInfo(gl, bufferInfo);
    }

    class Light {
        static index = 0;

        constructor() {
            this.position = [0, 0, 0];
            this.color = [1, 1, 1];
            this.intensity = 1.0;
            this.index = Light.index++;
        }

        updatePosition(index) {
            let position = this.position;
            let lightIndex = this.index;
            return function (event, ui) {
                position[index] = ui.value;
                updateLights(lightIndex);
            };
        }

        updateColor(index) {
            let color = this.color;
            let lightIndex = this.index;
            return function (event, ui) {
                color[index] = ui.value / 255;
                updateLights(lightIndex);
            };
        }

        updateIntensity() {
            let lightIndex = this.index
            return function (event, ui) {
                lights[lightIndex].intensity = ui.value;
                updateLights(lightIndex);
            };
        }
    }

    const lights = [new Light()];

    const light_positions = [];
    const light_colors = [];
    const light_intensities = [];

    light_positions.push(...lights[0].position);
    light_colors.push(...lights[0].color);
    light_intensities.push(lights[0].intensity);
    let num_lights = 1;


    let dropdown = document.querySelector("#light-selector");
    for (const light of lights) {
        const option = document.createElement('option');
        option.value = light.index;
        option.textContent = light.index;
        dropdown.appendChild(option);
    }

    dropdown.addEventListener('click', function (event) {
        const key = event.target.value;
        console.log(key);

        const selectedLight = lights.find(light => light.index === parseInt(key));

        webglLessonsUI.setupSlider("#x", { value: selectedLight.position[0], slide: selectedLight.updatePosition(0), min: -30, max: 30 });
        webglLessonsUI.setupSlider("#y", { value: selectedLight.position[1], slide: selectedLight.updatePosition(1), min: -30, max: 30 });
        webglLessonsUI.setupSlider("#z", { value: selectedLight.position[2], slide: selectedLight.updatePosition(2), min: -30, max: 30 });
        webglLessonsUI.setupSlider("#r", { value: selectedLight.color[0] * 255, slide: selectedLight.updateColor(0), min: 0, max: 255 });
        webglLessonsUI.setupSlider("#g", { value: selectedLight.color[1] * 255, slide: selectedLight.updateColor(1), min: 0, max: 255 });
        webglLessonsUI.setupSlider("#b", { value: selectedLight.color[2] * 255, slide: selectedLight.updateColor(2), min: 0, max: 255 });
        webglLessonsUI.setupSlider("#intensity", { value: selectedLight.intensity, slide: selectedLight.updateIntensity(), min: 0, max: 5, step: 0.1, precision: 2});

        
    });

    const add_light_button = document.querySelector("#add-light");

    add_light_button.addEventListener('click', function (event) {
        if (num_lights >= 5) {
            return;
        }
        const new_light = new Light();
        lights.push(new_light);
        light_positions.push(...new_light.position);
        light_colors.push(...new_light.color);
        light_intensities.push(new_light.intensity);
        const dropdown = document.querySelector("#light-selector");
        const option = document.createElement('option');
        option.value = new_light.index;
        option.textContent = new_light.index;
        num_lights++;
        dropdown.appendChild(option);
    });

    


    const fieldOfViewRadians = degToRad(55);

    function updateLights(index) {
        const light = lights[index];
        index *= 3
        light_positions[index] = light.position[0];
        light_positions[index + 1] = light.position[1];
        light_positions[index + 2] = light.position[2];
        light_colors[index] = light.color[0];
        light_colors[index + 1] = light.color[1];
        light_colors[index + 2] = light.color[2];
        light_intensities[index/3] = light.intensity;
    }

    function render(time) {
        time *= 0.001;

        twgl.resizeCanvasToDisplaySize(gl.canvas);

        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);

        gl.clearColor(0, 0, 0, .9);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);


        const { parts, objOffset, range } = model

        const u_world = m4.yRotation(time * 0.5);
        // const u_world = m4.yRotation(1.5);

        const cameraTarget = [0, 0, 0];
        const radius = m4.length(range) * 1.2;
        const cameraPosition = m4.addVectors(cameraTarget, [
            0,
            0,
            radius,
        ]);
        const zNear = radius / 100;
        const zFar = radius * 3;
        const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;

        const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);
        const up = [0, 1, 0];
        const camera = m4.lookAt(cameraPosition, cameraTarget, up);
        let view = m4.inverse(camera);
        view = m4.translate(view, ...objOffset);

        const sharedUniforms = {
            u_ambientLight: [0.1, 0.1, 0.1],
            u_lightPosition: light_positions,
            u_lightColor: light_colors,
            u_ligthIntensity: light_intensities,
            u_numLights: num_lights,
            u_view: view,
            u_projection: projection,
            u_viewWorldPosition: cameraPosition,
        };

        console.log("Light Intensities: "+light_intensities + "\nLight Positions: "+light_positions);

        if (selectedShader === 'toon') {
            programInfo = toonProgramInfo;
        } else if (selectedShader === 'phong') {
            programInfo = phongProgramInfo;
        } 
        // else if (selectedShader === 'gouraud') {
        //     programInfo = gouraudrogramInfo;
        // }

        gl.useProgram(programInfo.program);

        twgl.setUniforms(programInfo, sharedUniforms);


        for (const { bufferInfo, vao, material } of parts) {
            // gl.bindVertexArray(vao);

            // twgl.setUniforms(programInfo, {
            //     u_view: view,
            //     u_world,
            // }, material);

            // twgl.drawBufferInfo(gl, bufferInfo);

            drawScene(u_world, bufferInfo, vao, material, programInfo);
        }


        requestAnimationFrame(render);

    }

    requestAnimationFrame(render);
}

main();
