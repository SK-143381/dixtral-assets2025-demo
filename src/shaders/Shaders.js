// Shaders.js - WebGL shader management
export class Shaders {
    static get vertexShaderSource() {
        return `
            attribute vec3 aVertexPosition;
            attribute vec4 aVertexColor;
            attribute float aPointSize;
            
            uniform mat4 uModelViewMatrix;
            uniform mat4 uProjectionMatrix;
            uniform float uPointScale;
            
            varying vec4 vColor;
            
            void main(void) {
                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aVertexPosition, 1.0);
                gl_PointSize = aPointSize * uPointScale;
                vColor = aVertexColor;
            }
        `;
    }

    static get fragmentShaderSource() {
        return `
            precision mediump float;
            varying vec4 vColor;
            
            void main(void) {
                vec2 coord = gl_PointCoord - vec2(0.5);
                if(length(coord) > 0.5) {
                    discard;
                }
                
                float alpha = 1.0 - length(coord) * 1.5;
                alpha = pow(alpha, 0.8);
                gl_FragColor = vec4(vColor.rgb * 1.3, vColor.a * alpha);
            }
        `;
    }

    static get lineVertexShaderSource() {
        return `
            attribute vec3 aVertexPosition;
            attribute vec4 aVertexColor;
            
            uniform mat4 uModelViewMatrix;
            uniform mat4 uProjectionMatrix;
            
            varying vec4 vColor;
            
            void main(void) {
                gl_Position = uProjectionMatrix * uModelViewMatrix * vec4(aVertexPosition, 1.0);
                vColor = aVertexColor;
            }
        `;
    }

    static get lineFragmentShaderSource() {
        return `
            precision mediump float;
            varying vec4 vColor;
            
            void main(void) {
                gl_FragColor = vColor;
            }
        `;
    }

    static createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);

        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const error = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`Shader compilation error: ${error}`);
        }

        return shader;
    }

    static createProgram(gl, vertexShader, fragmentShader) {
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Failed to link shader program:', gl.getProgramInfoLog(program));
            return null;
        }

        return program;
    }

    static initializeShaders(gl) {
        // Create point shader program
        const vertexShader = this.createShader(gl, gl.VERTEX_SHADER, this.vertexShaderSource);
        const fragmentShader = this.createShader(gl, gl.FRAGMENT_SHADER, this.fragmentShaderSource);
        const shaderProgram = this.createProgram(gl, vertexShader, fragmentShader);

        // Create line shader program
        const lineVertexShader = this.createShader(gl, gl.VERTEX_SHADER, this.lineVertexShaderSource);
        const lineFragmentShader = this.createShader(gl, gl.FRAGMENT_SHADER, this.lineFragmentShaderSource);
        const lineShaderProgram = this.createProgram(gl, lineVertexShader, lineFragmentShader);

        if (!shaderProgram || !lineShaderProgram) {
            throw new Error('Failed to initialize shaders');
        }

        // Get attribute and uniform locations for point shader
        shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, 'aVertexPosition');
        shaderProgram.vertexColorAttribute = gl.getAttribLocation(shaderProgram, 'aVertexColor');
        shaderProgram.pointSizeAttribute = gl.getAttribLocation(shaderProgram, 'aPointSize');
        
        shaderProgram.modelViewMatrixUniform = gl.getUniformLocation(shaderProgram, 'uModelViewMatrix');
        shaderProgram.projectionMatrixUniform = gl.getUniformLocation(shaderProgram, 'uProjectionMatrix');
        shaderProgram.pointScaleUniform = gl.getUniformLocation(shaderProgram, 'uPointScale');

        // Get attribute and uniform locations for line shader
        lineShaderProgram.vertexPositionAttribute = gl.getAttribLocation(lineShaderProgram, 'aVertexPosition');
        lineShaderProgram.vertexColorAttribute = gl.getAttribLocation(lineShaderProgram, 'aVertexColor');
        
        lineShaderProgram.modelViewMatrixUniform = gl.getUniformLocation(lineShaderProgram, 'uModelViewMatrix');
        lineShaderProgram.projectionMatrixUniform = gl.getUniformLocation(lineShaderProgram, 'uProjectionMatrix');

        return {
            pointShader: shaderProgram,
            lineShader: lineShaderProgram
        };
    }

} 