const vs = `#version 300 es
  precision highp float;
  
  in vec4 a_position;
  in vec3 a_normal;
  in vec4 a_color;

  uniform mat4 u_projection;
  uniform mat4 u_view;
  uniform mat4 u_world;
  uniform vec3 u_viewWorldPosition;
  uniform vec3 u_lightPosition[5];
  uniform highp int u_numLights;
  
  out vec3 v_normal;
  out vec3 v_surfaceToView;
  out vec4 v_color;
  out vec3 v_lightPosition[5];

  void main() {
    vec4 worldPosition = u_world * a_position;
    gl_Position = u_projection * u_view * worldPosition;
    v_surfaceToView = u_viewWorldPosition - worldPosition.xyz;
    v_normal = mat3(u_world) * a_normal;
    v_color = a_color;
    
    for (int i = 0; i < u_numLights; i++) {
      v_lightPosition[i] = u_lightPosition[i] - worldPosition.xyz;
    }
  }
`;

const phong_fs = `#version 300 es
  precision highp float;

  in vec3 v_normal;
  in vec3 v_surfaceToView;
  in vec4 v_color;
  in vec3 v_lightPosition[5];

  uniform vec3 diffuse;
  uniform vec3 emissive;
  uniform vec3 ambient;
  uniform vec3 specular;
  uniform float shininess;
  uniform float opacity;
  uniform vec3 u_ambientLight;

  uniform vec3 u_lightColor[5];
  uniform float u_ligthIntensity[5];
  uniform highp int u_numLights;
  
  out vec4 outColor;

  void main () {
    vec3 normal = normalize(v_normal);
    vec3 surfaceToViewDirection = normalize(v_surfaceToView);

    vec3 finalColor = vec3(0.0); 
    
    vec3 ambientColor = vec3(0.0);
    vec3 specularColor = vec3(0.0, 0.0, 0.0); 
    for (int i = 0; i < u_numLights; i++) { 
        vec3 lightDirection = normalize(v_lightPosition[i]);
        float diffuseFactor = max(dot(normal, lightDirection), 0.0);
        finalColor += diffuse * diffuseFactor * u_ligthIntensity[i] * u_lightColor[i];
        
        vec3 halfVector = normalize(lightDirection + surfaceToViewDirection);
        float specularFactor = pow(max(dot(normal, halfVector), 0.0), shininess * 0.3);
        specularColor += specular * specularFactor * u_ligthIntensity[i] * u_lightColor[i]; 
    }

    ambientColor += u_ambientLight;
 
    finalColor += ambientColor * ambient;
    finalColor += emissive;

    finalColor += specularColor;

    //finalColor /= float(u_numLights);

    outColor = vec4(finalColor, opacity);
  }
`;


const toon_fs = `#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_surfaceToView;
in vec4 v_color;
in vec3 v_lightPosition[5];

uniform vec3 u_lightColor[5];
uniform float u_ligthIntensity[5];
uniform highp int u_numLights;

out vec4 outColor;

void main () {
    vec3 normal = normalize(v_normal);
    vec3 surfaceToViewDirection = normalize(v_surfaceToView);

    vec3 finalColor = vec3(0.0); 

    for (int i = 0; i < u_numLights; i++) { 
        vec3 lightDirection = normalize(v_lightPosition[i]);
        float diffuseFactor = max(dot(normal, lightDirection), 0.0);
        finalColor += diffuseFactor * u_ligthIntensity[i];
        
        vec3 halfVector = normalize(lightDirection + surfaceToViewDirection);
    }

    //finalColor /= float(u_numLights);

    float intensity = finalColor.r + finalColor.g + finalColor.b;
    if (intensity < 0.3) {
        finalColor = vec3(0.0); // Black
    } else if (intensity < 1.0) {
        finalColor = vec3(0.5); // Gray
    } else {
        finalColor = vec3(1.0); // White
    }

    outColor = vec4(finalColor, 1.0);
}`;

const gouraud_vs = `#version 300 es
  precision highp float;
  
  in vec4 a_position;
  in vec3 a_normal;
  in vec4 a_color;

  uniform mat4 u_projection;
  uniform mat4 u_view;
  uniform mat4 u_world;
  uniform vec3 u_viewWorldPosition;
  uniform vec3 u_lightPosition[5];
  uniform highp int u_numLights;
  
  out vec3 v_normal;
  out vec4 v_color;
  out vec3 v_lightIntensity; // Intensity of light at each vertex
  out vec3 v_lightPosition[5];
  out vec3 v_surfaceToView;

  void main() {
    vec4 worldPosition = u_world * a_position;
    gl_Position = u_projection * u_view * worldPosition;
    v_surfaceToView = u_viewWorldPosition - worldPosition.xyz;
    v_normal = mat3(u_world) * a_normal;
    v_color = a_color;

    v_lightIntensity = vec3(0.0); // Initialize light intensity at vertex to zero
    for (int i = 0; i < u_numLights; i++) {
      vec3 lightDirection = normalize(u_lightPosition[i] - worldPosition.xyz);
      float diffuseFactor = max(dot(normalize(v_normal), lightDirection), 0.0);
      v_lightIntensity += diffuseFactor * vec3(1.0); // Assuming white light for simplicity
    }

    for (int i = 0; i < u_numLights; i++) {
      v_lightPosition[i] = u_lightPosition[i] - worldPosition.xyz;
    }
  }
`;

const gouraud_fs = `#version 300 es
  precision highp float;

  in vec3 v_normal;
  in vec3 v_surfaceToView;
  in vec4 v_color;
  in vec3 v_lightPosition[5];

  uniform vec3 diffuse;
  uniform vec3 emissive;
  uniform float opacity;
  
  out vec4 outColor;

  void main () {
    vec3 normal = normalize(v_normal);
    vec3 surfaceToViewDirection = normalize(v_surfaceToView);

    vec3 finalColor = vec3(0.0); 
    
    vec3 ambientColor = vec3(0.0);
    for (int i = 0; i < 3; i++) { // Assuming only 3 lights for simplicity
        vec3 lightDirection = normalize(v_lightPosition[i]);
        float diffuseFactor = max(dot(normal, lightDirection), 0.0);
        finalColor += diffuse * diffuseFactor; // Diffuse color is interpolated

        // Ambient lighting
        ambientColor += vec3(0.1); // Sample ambient color

        // Specular lighting (not included in Gouraud shader)
    }

    finalColor += ambientColor;

    finalColor += emissive;

    outColor = vec4(finalColor, opacity);
  }
`;






// const toon_fs = `#version 300 es
// precision highp float;

// in vec3 v_normal;

// uniform vec3 u_lightDirection;

// out vec4 outColor;

// float diffuseFactor(vec3 normal, vec3 light_direction) {
//     float df = dot(normalize(normal), normalize(light_direction));

//     if (gl_FrontFacing) {
//         df = -df;
//     }

//     return max(0.0, df);
// }

// /*
//  * The main program
//  */
// void main() {
//     vec3 light_direction = -u_lightDirection;

//     // Calculate the light diffusion factor
//     float df = diffuseFactor(v_normal, light_direction);

//     // Define the toon shading steps
//     float nSteps = 4.0;
//     float step = sqrt(df) * nSteps;
//     step = (floor(step) + smoothstep(0.48, 0.52, fract(step))) / nSteps;

//     // Calculate the surface color
//     float surface_color = step * step;

//     // Fragment shader output
//     outColor = vec4(vec3(surface_color), 1.0);
// }`;

const toon_shader = [vs, toon_fs];
const phong_shader = [vs, phong_fs];
// const gouraud_shader = [gouraud_vs, gouraud_fs];

// export { toon_shader, phong_shader, gouraud_shader };
export { toon_shader, phong_shader };
