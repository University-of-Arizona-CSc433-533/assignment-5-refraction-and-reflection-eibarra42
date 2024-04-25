/*
 This file is a template for a05 CS433/533
 
 Author: Amir Mohammad Esmaieeli Sikaroudi
 Email: amesmaieeli@email.arizona.edu
 Date: April, 2022
 
 Sources uses for this template:
 First Obj parser:
 https://webglfundamentals.org/
 The library for decoding PNG files is from:
 https://github.com/arian/pngjs
*/

var input = document.getElementById("load_scene");
input.addEventListener("change", readScene);
var dummy_canvas = document.getElementById('dummy_canvas');
var ctx = dummy_canvas.getContext('2d');

var renderingCanvas = document.querySelector("#canvas");
var gl = renderingCanvas.getContext("webgl",{preserveDrawingBuffer: true});

var modelMatrix;

var currentScene;//Current rendering scene

var doneLoading=false;//Checks if the scene is done loading to prevent renderer draw premuturly.
var doneProgramming=false;
var filesToRead=[];//List of files to be read
var imageData;//The image contents are stored separately here
var scene;//The code can save multiple scenes but no HTML element is made to give user option of switching scenes without selecting file agail. By default the firt scene is shown and the other selected scenes are just stored.
var objParsed;

let cubemap_pngs = [];
let cubemap_program;

let cubemap_texid;
let cubemap_position_buffer;
let cubemap_index_buffer;
let time_wave_start;
let should_record_start = true;
let rr;

// Mirror camera position
var cameraPositionPrime;

var billboardProgram;
var waterHeight=0.5;

var wh = document.getElementById('whID');//Slider for water height
var lambda = document.getElementById("lambdaID");
var rrE = document.getElementById('rrID');//Slider for water height

document.addEventListener("keydown", (ev) => {
	if (ev.key === 'd') {
		should_record_start = true;
	}
});

wh.addEventListener("input", function(evt) {
	if(doneLoading==true){
		waterHeight=Number(wh.value);
		var wZLabel = document.getElementById("whLabelID");
		wZLabel.innerHTML = wh.value;
		wh.label = "Water height: "+wh.value;//refresh wh text
	}
},false);

lambda.addEventListener("input", function(evt) {
	if (doneLoading) {
		let lLabel = document.getElementById("lambdaLabelID");
		lLabel.innerHTML = lambda.value;
	}
},false);

rrE.addEventListener("input", function(evt) {
	if (doneLoading) {
		rr = Number(rrE.value);
		let rrLabel = document.getElementById("rrLabelID");
		rrLabel.innerHTML = rr;
		rrE.label = "Refraction/Reflectance: " + rr;
	}
},false);

function readScene()//This is the function that is called after user selects multiple files of images and scenes
{
	if (input.files.length > 0) {
		if(doneLoading==true)//This condition checks if this is the first time user has selected a scene or not. If doneLoading==true, then the user has selected a new scene while rendering
		{
			newSceneRequested=true;
			filesToRead=[];//List of files to be read
			imageData=[];//The image contents are stored separately here
			objsData=[];
			scenes=[];//List of scenes
		}
		doneLoading=false;
		for(var i=0;i<input.files.length;i++)
		{
			var file = input.files[i];
			var reader = new FileReader();
			filesToRead[i]=true;
			reader.onload = (function(f,index) {
				return function(e) {
					//Get the file name
					let fileName = f.name;
					//Get the file Extension 
					let fileExtension = fileName.split('.').pop();
					if(fileExtension=='ppm')
					{
						var file_data = this.result;
						let img=parsePPM(file_data,fileName);//Parse image
						imageData.push(img);
						filesToRead[index]=false;
					}else if(fileExtension=='js')
					{
						var file_data = this.result;
						scene=parseScene(file_data);//Parse scene
						filesToRead[index]=false;
					}else if(fileExtension=='json')
					{
						var file_data = this.result;
						scene=parseScene(file_data);//Parse scene
						filesToRead[index]=false;
					}else if(fileExtension=='obj')
					{
						var file_data = this.result;
						objParsed=parseOBJ(file_data);//Parse obj to almost buffer-ready Float32Array arrays.

						filesToRead[index]=false;
					}else if(fileExtension=='png')
					{
						var file_data = this.result;

						var pngImage = new PNGReader(file_data);

						pngImage.parse(function(err, png){
							if (err) throw err;

							let img = parsePNG(png,fileName);

							if (fileName.startsWith("cubemap")) {
								cubemap_pngs.push(img);
								filesToRead[index]=false;
								return;
							}

							let width=img.width;
							let height=img.height;
							document.getElementById("dummy_canvas").setAttribute("width", img.width);
							document.getElementById("dummy_canvas").setAttribute("height", img.height);
							let showCaseData = ctx.createImageData(width, height);
							for(var i = 0; i < img.data.length; i+=1){
								showCaseData.data[i*4]=img.data[i].r;
								showCaseData.data[i*4+1]=img.data[i].g;
								showCaseData.data[i*4+2]=img.data[i].b;
								showCaseData.data[i*4+3]=img.data[i].a;
							}
							ctx.putImageData(showCaseData, dummy_canvas.width/2 - width/2, dummy_canvas.height/2 - height/2);

							let imageRead=ctx.getImageData(0, 0, dummy_canvas.width, dummy_canvas.height);
							imageData=imageRead;
							filesToRead[index]=false;
						});
					}
				};
			})(file,i);
			let fileName = file.name;
			let fileExtension = fileName.split('.').pop();
			if(fileExtension=='ppm' || fileExtension=='js' || fileExtension=='json' || fileExtension=='obj')
			{
				reader.readAsBinaryString(file);
			}else if(fileExtension=='png'){
				reader.readAsArrayBuffer(file);
			}

		}
		drawScene();//Enter the drawing loop();
	}
}

// Draw the scene.
function drawScene(now) {
	if(doneLoading==false)
	{
		var isReaminingRead=false;
		for(let j=0;j<filesToRead.length;j++)
		{
			if(filesToRead[j]==true)//Check if each file is read
			{
				isReaminingRead=true;//If one is not read, then make sure drawing scene will wait for files to be read
			}
		}
		if(isReaminingRead==false)//If all files are read
		{
			currentScene=scene;
			currentScene.billboard.img=imageData;

			doneLoading=true;
		}
	}else if(doneLoading==true)//If scene is completely read
	{
		if(doneProgramming==false){
			programAll();
			preprocessBuffers();
			doneProgramming=true;

			// Support for Alpha
			gl.enable(gl.BLEND)
			gl.colorMask(true, true, true, true);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		}else{
			renderingFcn(now);
		}
	}

	// Call drawScene again next frame with delay to give user chance of interacting GUI
	requestAnimationFrame(drawScene);
}

function renderingFcn(now){
	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	webglUtils.resizeCanvasToDisplaySize(gl.canvas);

	gl.clearColor(currentScene.camera.DefaulColor[0], currentScene.camera.DefaulColor[1], currentScene.camera.DefaulColor[2], 1.0);

	// Clear the canvas AND the depth buffer.
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	if (Math.abs(Math.abs(currentScene.camera.position.y) - 11.99) < 0.01) {
		console.log(currentScene.camera.position.y);
	}

	if (should_record_start) {
		time_wave_start = now;
		should_record_start = false;
	}

	renderCubemap(now);
	renderBillboard(now);
}

function renderCubemap(now) {
	gl.useProgram(cubemap_program.program);
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemap_texid);

	gl.enableVertexAttribArray(cubemap_program.position);

	gl.bindBuffer(gl.ARRAY_BUFFER, cubemap_position_buffer);
	gl.vertexAttribPointer(cubemap_program.position, 3, gl.FLOAT, false, 0, 0);

	var cameraMatrix;
	// Compute the camera's matrix using look at.
	cameraMatrix = m4.lookAt([currentScene.camera.position.x,currentScene.camera.position.y,currentScene.camera.position.z], [currentScene.camera.target.x,currentScene.camera.target.y,currentScene.camera.target.z], [currentScene.camera.up.x,currentScene.camera.up.y,currentScene.camera.up.z]);

	// Make a view matrix from the camera matrix.
	var viewMatrix = m4.inverse(cameraMatrix);

	var aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
	var projectionMatrix =
		m4.perspective(degToRad(currentScene.camera.fov), aspect, currentScene.camera.near, 1000);
	var viewProjectionMatrix = m4.multiply(projectionMatrix, viewMatrix);

	gl.uniformMatrix4fv(cubemap_program.viewProj, false, viewProjectionMatrix);
	gl.uniform1i(cubemap_program.skybox_texture, 0);

	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubemap_index_buffer);
	gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_BYTE, 0);
}

function renderBillboard(now){
	gl.disable(gl.CULL_FACE);

	// Tell it to use our program (pair of shaders)
	gl.useProgram(billboardProgram.program);

	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemap_texid);

	// Turn on the position attribute
	gl.enableVertexAttribArray(billboardProgram.positionLocationAttrib);

	// Bind the position buffer.
	gl.bindBuffer(gl.ARRAY_BUFFER, currentScene.billboard.positionBuffer);

	// Tell the position attribute how to get data out of positionBuffer (ARRAY_BUFFER)
	var size = 3;          // 3 components per iteration
	var type = gl.FLOAT;   // the data is 32bit floats
	var normalize = false; // don't normalize the data
	var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next position
	var offset = 0;        // start at the beginning of the buffer
	gl.vertexAttribPointer(
		billboardProgram.positionLocationAttrib, size, type, normalize, stride, offset);

	// Turn on the normal attribute
	gl.enableVertexAttribArray(billboardProgram.normalLocationAttrib);

	// Bind the normal buffer.
	gl.bindBuffer(gl.ARRAY_BUFFER, currentScene.billboard.normalBuffer);

	// Tell the normal attribute how to get data out of normalBuffer (ARRAY_BUFFER)
	var size = 3;          // 3 components per iteration
	var type = gl.FLOAT;   // the data is 32bit floats
	var normalize = false; // don't normalize the data
	var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next normal
	var offset = 0;        // start at the beginning of the buffer
	gl.vertexAttribPointer(
		billboardProgram.normalLocationAttrib, size, type, normalize, stride, offset);


	// Turn on the normal attribute
	gl.enableVertexAttribArray(billboardProgram.texcoordLocationAttrib);

	// Bind the normal buffer.
	gl.bindBuffer(gl.ARRAY_BUFFER, currentScene.billboard.textureBuffer);

	// Tell the normal attribute how to get data out of normalBuffer (ARRAY_BUFFER)
	var size = 2;          // 3 components per iteration
	var type = gl.FLOAT;   // the data is 32bit floats
	var normalize = false; // don't normalize the data
	var stride = 0;        // 0 = move forward size * sizeof(type) each iteration to get the next normal
	var offset = 0;        // start at the beginning of the buffer
	gl.vertexAttribPointer(
		billboardProgram.texcoordLocationAttrib, size, type, normalize, stride, offset);

	// Compute the projection matrix
	var aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
	var projectionMatrix =
		m4.perspective(degToRad(currentScene.camera.fov), aspect, currentScene.camera.near, currentScene.camera.far);

	var cameraMatrix;
	// Compute the camera's matrix using look at.
	cameraMatrix = m4.lookAt([currentScene.camera.position.x,currentScene.camera.position.y,currentScene.camera.position.z], [currentScene.camera.target.x,currentScene.camera.target.y,currentScene.camera.target.z], [currentScene.camera.up.x,currentScene.camera.up.y,currentScene.camera.up.z]);

	// Make a view matrix from the camera matrix.
	var viewMatrix = m4.inverse(cameraMatrix);

	var viewProjectionMatrix = m4.multiply(projectionMatrix, viewMatrix);

	// Set the viewProjectionMatrix.
	gl.uniformMatrix4fv(billboardProgram.worldViewProjectionUniformLocation, false, viewProjectionMatrix);

	// Tell the shader to use texture unit 0 for u_texture
	gl.uniform1i(billboardProgram.textureUniformLocation, 0);

	// Send the light direction to the uniform.
	gl.uniform3fv(billboardProgram.lightDirectionUniformLocation, new Float32Array([currentScene.light.locationPoint.x,currentScene.light.locationPoint.y,currentScene.light.locationPoint.z]));
	gl.uniform3fv(billboardProgram.camposUniformLocation, new Float32Array([currentScene.camera.position.x,currentScene.camera.position.y,currentScene.camera.position.z]));
	gl.uniform1f(billboardProgram.timeUniformLocation, now / 500.0);
	gl.uniform1f(billboardProgram.time_start_loc, (time_wave_start / 500.0));
	gl.uniform1f(billboardProgram.ampUniformLocation, waterHeight);
	gl.uniform1f(billboardProgram.rr_loc, rr);
	gl.uniform1f(gl.getUniformLocation(billboardProgram.program, "lambda"), parseFloat(lambda.value));

	//TODO: You need to send "time" and "water height" to the shader program
	// You can eaither use the uniform location here or you can use your preprocessed uniform location in the program.

	gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function programAll(){
	programBillboard();
	cubemap_program = programCubemap();
}

function preprocessBuffers(){
	makeCubemapBuffers();
	makeBillboardBuffers();
}

function rgba_array(png) {
	let result = new Uint8Array(png.width * png.height * 4);
	for (let i = 0; i < png.data.length; i++) {
		result[i * 4    ] = png.data[i].r;
		result[i * 4 + 1] = png.data[i].g;
		result[i * 4 + 2] = png.data[i].b;
		result[i * 4 + 3] = png.data[i].a;
	}

	return result;
}

function makeCubemapBuffers(){
	cubemap_texid = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_CUBE_MAP, cubemap_texid);

	for (let i = 0; i < cubemap_pngs.length; i++) {
		let png = cubemap_pngs[i];
		let tex_pos = gl.TEXTURE_CUBE_MAP_NEGATIVE_X;
		let tex_data = rgba_array(png);

		if (png.fileName.indexOf("negy") !== -1) {
			tex_pos = gl.TEXTURE_CUBE_MAP_NEGATIVE_Y;
		} else if (png.fileName.indexOf("negz") !== -1) {
			tex_pos = gl.TEXTURE_CUBE_MAP_NEGATIVE_Z;
		} else if (png.fileName.indexOf("posx") !== -1) {
			tex_pos = gl.TEXTURE_CUBE_MAP_POSITIVE_X;
		} else if (png.fileName.indexOf("posy") !== -1) {
			tex_pos = gl.TEXTURE_CUBE_MAP_POSITIVE_Y;
		} else if (png.fileName.indexOf("posz") !== -1) {
			tex_pos = gl.TEXTURE_CUBE_MAP_POSITIVE_Z;
		}

		gl.texImage2D(tex_pos, 0, gl.RGBA, png.width, png.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, tex_data);
	}

	gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

	const SCALE = 100 / 2;
	let positions = new Float32Array([
		-SCALE, -SCALE, -SCALE, // 0
		SCALE, -SCALE, -SCALE, // 1
		SCALE,  SCALE, -SCALE, // 2
		-SCALE,  SCALE, -SCALE, // 3
		-SCALE, -SCALE, SCALE,  // 4
		SCALE, -SCALE, SCALE,  // 5
		SCALE,  SCALE, SCALE,  // 6
		-SCALE,  SCALE, SCALE,  // 7
	]);

	let indices = new Uint8Array([
		0, 1, 2, 0, 2, 3,
		4, 6, 5, 4, 7, 6,
		7, 3, 2, 7, 2, 6,
		4, 1, 0, 4, 5, 1,
		5, 6, 2, 5, 2, 1,
		4, 3, 7, 4, 0, 3
	]);

	cubemap_position_buffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, cubemap_position_buffer);
	gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

	cubemap_index_buffer = gl.createBuffer();
	gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubemap_index_buffer);
	gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
}

function makeBillboardBuffers(){
	let sceneBillboard=currentScene.billboard;

	// Create a buffer for positions
	let billboardPositionBuffer = gl.createBuffer();
	// Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = positionBuffer)
	gl.bindBuffer(gl.ARRAY_BUFFER, billboardPositionBuffer);
	// Put the positions in the buffer
	setBillboardGeometry(gl,sceneBillboard);

	// provide texture coordinates for the rectangle.
	let billboardTextcoordBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, billboardTextcoordBuffer);
	// Set Texcoords.
	setBillboardTexcoords(gl,sceneBillboard);

	// Create a buffer to put normals in
	let billboardNormalBuffer = gl.createBuffer();
	// Bind it to ARRAY_BUFFER (think of it as ARRAY_BUFFER = normalBuffer)
	gl.bindBuffer(gl.ARRAY_BUFFER, billboardNormalBuffer);
	// Put normals data into buffer
	setBillboardNormals(gl,sceneBillboard);

	// Create a texture.
	var billboardTextureBuffer = gl.createTexture();
	gl.activeTexture(gl.TEXTURE0);
	gl.bindTexture(gl.TEXTURE_2D, billboardTextureBuffer);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,gl.UNSIGNED_BYTE, imageData);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.generateMipmap(gl.TEXTURE_2D);

	sceneBillboard.setBuffers(billboardPositionBuffer,billboardTextcoordBuffer,billboardNormalBuffer,billboardTextureBuffer);
}

class CubemapProgram {
	constructor(program, position, viewProj, skybox_texture) {
		this.program = program;
		this.position = position;
		this.viewProj = viewProj;
		this.skybox_texture = skybox_texture;
	}
}

class BillboardProgram{
	constructor(program, texcoordLocationAttrib,positionLocationAttrib,
							normalLocationAttrib,ampUniformLocation,camposUniformLocation,
							textureUniformLocation,worldViewProjectionUniformLocation,
							lightDirectionUniformLocation,timeUniformLocation, time_start_loc, rr_loc){
		this.program=program;
		this.texcoordLocationAttrib = texcoordLocationAttrib;
		this.positionLocationAttrib=positionLocationAttrib;
		this.normalLocationAttrib=normalLocationAttrib;
		this.ampUniformLocation = ampUniformLocation;
		this.camposUniformLocation=camposUniformLocation;
		this.textureUniformLocation=textureUniformLocation;
		this.worldViewProjectionUniformLocation=worldViewProjectionUniformLocation;
		this.lightDirectionUniformLocation=lightDirectionUniformLocation;
		this.timeUniformLocation = timeUniformLocation;
		this.time_start_loc = time_start_loc;
		this.rr_loc = rr_loc;
	}
}

function programCubemap() {
	let vShaderObj =
		"attribute vec4 a_position;\n"+
		"varying vec4 worldPos;\n"+
		"uniform mat4 viewProjection;\n"+
		"void main() {\n"+
		"  worldPos = a_position;\n"+
		"  gl_Position = viewProjection * a_position;\n"+
		"}";

	let fShaderObj =
		"#version 100\n"+
		"precision mediump float;\n"+
		"varying vec4 worldPos;\n"+
		"uniform samplerCube skybox;\n"+
		"void main() {\n"+
		"  gl_FragColor = textureCube(skybox, worldPos.xyz);\n"+
		"}";

	let programCube = webglUtils.createProgramFromSources(gl, [vShaderObj, fShaderObj]);

	let positionAttrib = gl.getAttribLocation(programCube, "a_position");

	let viewProj = gl.getUniformLocation(programCube, "viewProjection");
	let skybox = gl.getUniformLocation(programCube, "skybox");

	return new CubemapProgram(programCube, positionAttrib, viewProj, skybox);
}

function programBillboard(){
	console.log(cubemap_pngs.length);

	//TODO: Change the shader program to calculate Snell's law. This is the major part of this homework.
	// You need to implement circle logic, calculate the angles, calculate displacement and change the texture coordinate accordingly.
	// Additionally you need to implement light intensity logic which follows the Snell's law.
	// You can check if the displaced texture coordinate is outside [0,1] and make the fragments invisible (shows background)
	// The waves should follow sin and cosin functions in x and z directions. The frequency depends on the time scale passes to the shader program.
	var vShaderObj = "attribute vec4 a_position;\n" +
		"attribute vec3 a_normal;\n" +
		"attribute vec2 a_texcoord;\n" +
		"\n" +
		"varying vec3 v_worldPos;\n" +
		"varying vec2 v_texcoord;\n" +
		"varying vec3 v_normal;\n" +
		"\n" +
		"uniform mat4 u_worldViewProjection;\n" +
		"\n" +
		"void main() {\n" +
		"    v_worldPos = a_position.xyz;\n" +
		"    // Sending the interpolated normal to the fragment shader.\n" +
		"    v_normal = a_normal;\n" +
		"    // Pass the texcoord to the fragment shader.\n" +
		"    v_texcoord = a_texcoord;\n" +
		"    // Multiply the position by the matrix.\n" +
		"    gl_Position = u_worldViewProjection * a_position;\n" +
		"}";

	var fShaderObj = "precision mediump float;\n" +
		"\n" +
		"varying vec3 v_worldPos;\n" +
		"varying vec2 v_texcoord;\n" +
		"varying vec3 v_normal;\n" +
		"\n" +
		"uniform vec3 u_campos;\n" +
		"uniform vec3 u_lightDirection;\n" +
		"uniform samplerCube env_map;\n" +
		"\n" +
		"uniform float u_twave_begin;\n" +
		"uniform float u_time;\n" +
		"uniform float u_amp;\n" +
		"uniform float u_rr;\n" +
		"\n" +
		"const float iof_water = 1.33;\n" +
		"const float discrete = 0.001;\n" +
		"\n" +
		"uniform float lambda;\n" +
		"const float lambda2 = 0.1;\n" +
		"\n" +
		"float time() {\n" +
		"    return u_time - u_twave_begin;\n" +
		"}\n" +
		"\n" +
		"float wave_height(vec2 point) {\n" +
		"    float n = length(point - vec2(0.5));\n" +
		"    return u_amp * exp(-lambda2 * (n + time())) * cos(lambda * n - time());\n" +
		"}\n" +
		"\n" +
		"float dwdn(vec2 point) {\n" +
		"    float n = length(point - vec2(0.5));\n" +
		"    return -u_amp * lambda * lambda2 * exp(-lambda2 * (n + time())) * sin(lambda * n - time());\n" +
		"}\n" +
		"\n" +
		"vec3 calc_world_pos() {\n" +
		"    return (wave_height(v_texcoord) * v_normal) + v_worldPos;\n" +
		"}\n" +
		"\n" +
		"vec3 calc_wave_normal() {\n" +
		"    vec3 dir = normalize(vec3(v_texcoord.x - 0.5, 0.0, v_texcoord.y - 0.5));\n" +
		"    vec3 tangent = normalize(vec3(dir.x, dwdn(v_texcoord), dir.z));\n" +
		"    vec3 aug = dot(v_normal, tangent) * tangent;\n" +
		"\n" +
		"    return normalize(v_normal - aug);\n" +
		"}\n" +
		"\n" +
		"vec3 snell_law(vec3 incident, vec3 normal, float ratio) {\n" +
		"    float cos_angle = dot(normal, incident);\n" +
		"    float sin2_angle = (1.0 - cos_angle * cos_angle);\n" +
		"    float inv_lhs2 = 1.0 - ratio * ratio * sin2_angle;\n" +
		"\n" +
		"    if (inv_lhs2 < 0.0)\n" +
		"        return vec3(0.0);\n" +
		"    else\n" +
		"        return ratio * incident - (ratio * cos_angle + sqrt(inv_lhs2)) * normal;\n" +
		"}\n" +
		"\n" +
		"void main() {\n" +
		"    vec3 normal = calc_wave_normal();\n" +
		"    vec3 worldPos = calc_world_pos();\n" +
		"\n" +
		"    float lightAmt = dot(u_lightDirection, normal);\n" +
		"    lightAmt = clamp(lightAmt, 0.1, 1.0);\n" +
		"    vec3 dirToFragment = normalize(worldPos - u_campos);\n" +
		"\n" +
		"    vec3 refractedDir = snell_law(dirToFragment, normal, 1.0 / iof_water);\n" +
		"    vec3 reflectedDir = reflect(dirToFragment, normal);\n" +
		"\n" +
		"    vec4 refract_color = textureCube(env_map, refractedDir);\n" +
		"    vec4 reflect_color = textureCube(env_map, reflectedDir);\n" +
		"\n" +
		"    gl_FragColor = vec4(lightAmt, lightAmt, lightAmt, 1.0) * mix(refract_color, reflect_color, u_rr);\n" +
		"}";

	let programBill = webglUtils.createProgramFromSources(gl, [vShaderObj, fShaderObj])

	// look up where the vertex data needs to go.
	let positionLocationAttrib = gl.getAttribLocation(programBill, "a_position");
	let texcoordLocationAttrib = gl.getAttribLocation(programBill, "a_texcoord");
	let normalLocationAttrib = gl.getAttribLocation(programBill, "a_normal");

	//Optional TODO: You can preprocess required Uniforms to avoid searching for uniforms when rendering.
	// lookup uniforms
	let textureUniformLocation = gl.getUniformLocation(programBill, "env_map");
	let worldViewProjectionUniformLocation = gl.getUniformLocation(programBill, "u_worldViewProjection");
	let lightDirectionUniformLocation = gl.getUniformLocation(programBill, "u_lightDirection");
	let campos_loc = gl.getUniformLocation(programBill, "u_campos");
	let time_loc = gl.getUniformLocation(programBill, "u_time");
	let amp_loc = gl.getUniformLocation(programBill, "u_amp");
	let time_start_loc = gl.getUniformLocation(programBill, "u_twave_begin");
	let rr_loc = gl.getUniformLocation(programBill, "u_rr");

	//Optional TODO: You can preprocess required Uniforms to avoid searching for uniforms when rendering.
	billboardProgram=new BillboardProgram(programBill,texcoordLocationAttrib,
		positionLocationAttrib,normalLocationAttrib, amp_loc,campos_loc,
		textureUniformLocation,worldViewProjectionUniformLocation,
		lightDirectionUniformLocation, time_loc, time_start_loc, rr_loc);
}

//The function for parsing PNG is done for you. The output is a an array of RGBA instances.
function parsePNG(png,fileName){
	let rawValues = png.getRGBA8Array();
	let width = png.getWidth();
	let height = png.getHeight();
	var readImageValues=[];//Array of RGBA instances
	var counterMain=0;//It is used for array of RGBAValue instances.
	for(var i = 0; i < rawValues.length; i++){
		let r=rawValues[i*4];
		let g=rawValues[i*4+1];
		let b=rawValues[i*4+2];
		let a=rawValues[i*4+3];
		readImageValues[counterMain]=new RGBAValue(r,g,b,a);
		counterMain=counterMain+1;
	}
	return new PNGImage(readImageValues,width,height,fileName);
}

class PNGImage{
	constructor(data,width,height,fileName){
		this.data=data;// The 1D array of RGBA pixel instances
		this.fileName=fileName;// Filename is useful to connect this image to appropriate Billboard after all materials are read.
		this.width=width;// Width of image
		this.height=height;// Height of image
	}
}

class RGBAValue{
	constructor(r,g,b,a)
	{
		this.r=r;
		this.g=g;
		this.b=b;
		this.a=a;
	}
}

function radToDeg(r) {
	return r * 180 / Math.PI;
}

function degToRad(d) {
	return d * Math.PI / 180;
}

// A utility function to convert a javascript Floar32Array to a buffer. This function must be called after the buffer is bound.
function setGeometryPositionBuffer(gl,obj) {
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(obj.geometries[0].data.position), gl.STATIC_DRAW);
}

// A utility function to convert a javascript Floar32Array to a buffer. This function must be called after the buffer is bound.
function setTextureCoordBuffer(gl,obj) {
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(obj.geometries[0].data.texcoord), gl.STATIC_DRAW);
}

// A utility function to convert a javascript Floar32Array to a buffer. This function must be called after the buffer is bound.
function setNormalBuffer(gl,obj) {
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(obj.geometries[0].data.normal), gl.STATIC_DRAW);
}

//This is a utility function to set vertex colors by random numbers
function setColorBuffer(gl,obj) {
	var numVertices=obj.geometries[0].data.position.length;
	var colors = new Float32Array(numVertices*3);
	var myrng = new Math.seedrandom('123');
	for(let i=0;i<numVertices*3;i++){
		colors[i]=0.4+myrng()/2;
	}
	gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
}

// Complete this function with counter clock-wise vertices of the billboard. The billboard should be made of two triangles.
function setBillboardGeometry(gl,billboard) {
	var positions = new Float32Array([
		billboard.UpperLeft.x, billboard.UpperLeft.y, billboard.UpperLeft.z,  // first triangle
		billboard.LowerLeft.x, billboard.LowerLeft.y, billboard.UpperRight.z,
		billboard.UpperRight.x, billboard.UpperRight.y, billboard.LowerLeft.z,
		billboard.UpperRight.x,  billboard.UpperRight.y, billboard.LowerLeft.z,  // second triangle
		billboard.LowerLeft.x,  billboard.LowerLeft.y, billboard.LowerRight.z,
		billboard.LowerRight.x,  billboard.LowerRight.y, billboard.LowerRight.z
	]);
	gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
}

function setBillboardTexcoords(gl,billboard) {
	gl.bufferData(
		gl.ARRAY_BUFFER,
		new Float32Array([
			0,0,
			0,1,
			1,0,
			1,0,
			0,1,
			1,1
		]),
		gl.STATIC_DRAW);
}

function setBillboardNormals(gl,billboard) {
	// Billboard's Upper left is a really weird number... Should be:
	let ul = new Vector3(billboard.UpperLeft.x, billboard.UpperLeft.y, billboard.LowerRight.z);
	let vec1=Vector3.minusTwoVectors(ul,billboard.LowerLeft);
	let vec2=Vector3.minusTwoVectors(billboard.LowerRight,billboard.LowerLeft);
	var normalVector=Vector3.normalizeVector(Vector3.crossProduct(vec1,vec2));//billboard normal vector
	gl.bufferData(
		gl.ARRAY_BUFFER,
		new Float32Array([
			normalVector.x,normalVector.y,normalVector.z,
			normalVector.x,normalVector.y,normalVector.z,
			normalVector.x,normalVector.y,normalVector.z,
			normalVector.x,normalVector.y,normalVector.z,
			normalVector.x,normalVector.y,normalVector.z,
			normalVector.x,normalVector.y,normalVector.z
		]),
		gl.STATIC_DRAW);
}

//This function is given to you for parsing the OBJ file.
function parseOBJ(text) {
	// because indices are base 1 let's just fill in the 0th data
	const objPositions = [[0, 0, 0]];
	const objTexcoords = [[0, 0]];
	const objNormals = [[0, 0, 0]];

	// same order as `f` indices
	const objVertexData = [
		objPositions,
		objTexcoords,
		objNormals,
	];

	// same order as `f` indices
	let webglVertexData = [
		[],   // positions
		[],   // texcoords
		[],   // normals
	];

	const materialLibs = [];
	const geometries = [];
	let geometry;
	let groups = ['default'];
	let material = 'default';
	let object = 'default';

	const noop = () => {};

	function newGeometry() {
		if (geometry && geometry.data.position.length) {
			geometry = undefined;
		}
	}

	function setGeometry() {
		if (!geometry) {
			const position = [];
			const texcoord = [];
			const normal = [];
			webglVertexData = [
				position,
				texcoord,
				normal,
			];
			geometry = {
				object,
				groups,
				material,
				data: {
					position,
					texcoord,
					normal,
				},
			};
			geometries.push(geometry);
		}
	}

	function addVertex(vert) {
		const ptn = vert.split('/');
		ptn.forEach((objIndexStr, i) => {
			if (!objIndexStr) {
				return;
			}
			const objIndex = parseInt(objIndexStr);
			const index = objIndex + (objIndex >= 0 ? 0 : objVertexData[i].length);
			webglVertexData[i].push(...objVertexData[i][index]);
		});
	}

	const keywords = {
		v(parts) {
			objPositions.push(parts.map(parseFloat));
		},
		vn(parts) {
			objNormals.push(parts.map(parseFloat));
		},
		vt(parts) {
			objTexcoords.push(parts.map(parseFloat));
		},
		f(parts) {
			setGeometry();
			const numTriangles = parts.length - 2;
			for (let tri = 0; tri < numTriangles; ++tri) {
				addVertex(parts[0]);
				addVertex(parts[tri + 1]);
				addVertex(parts[tri + 2]);
			}
		},
		s: noop,    // smoothing group
		mtllib(parts, unparsedArgs) {
			materialLibs.push(unparsedArgs);
		},
		usemtl(parts, unparsedArgs) {
			material = unparsedArgs;
			newGeometry();
		},
		g(parts) {
			groups = parts;
			newGeometry();
		},
		o(parts, unparsedArgs) {
			object = unparsedArgs;
			newGeometry();
		},
	};

	const keywordRE = /(\w*)(?: )*(.*)/;
	const lines = text.split('\n');
	for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
		const line = lines[lineNo].trim();
		if (line === '' || line.startsWith('#')) {
			continue;
		}
		const m = keywordRE.exec(line);
		if (!m) {
			continue;
		}
		const [, keyword, unparsedArgs] = m;
		const parts = line.split(/\s+/).slice(1);
		const handler = keywords[keyword];
		if (!handler) {
			console.warn('unhandled keyword:', keyword);  // eslint-disable-line no-console
			continue;
		}
		handler(parts, unparsedArgs);
	}

	for (const geometry of geometries) {
		geometry.data = Object.fromEntries(
			Object.entries(geometry.data).filter(([, array]) => array.length > 0));
	}

	return {
		geometries,
		materialLibs,
	};
}

//Extra math functions. This can not be used in shader program. GLSL has its own math functions.
class Vector3{
	constructor(x,y,z){
		this.x=x;
		this.y=y;
		this.z=z;
	}
	static multiplyVectorScalar(vec,scalar){
		return new Vector3(vec.x*scalar,vec.y*scalar,vec.z*scalar);
	}
	static sumTwoVectors(vec1,vec2){
		return new Vector3(vec1.x+vec2.x,vec1.y+vec2.y,vec1.z+vec2.z);
	}
	static minusTwoVectors(vec1,vec2){
		return new Vector3(vec1.x-vec2.x,vec1.y-vec2.y,vec1.z-vec2.z);
	}
	static normalizeVector(vec){
		let sizeVec=Math.sqrt(Math.pow(vec.x,2)+Math.pow(vec.y,2)+Math.pow(vec.z,2));
		return new Vector3(vec.x/sizeVec,vec.y/sizeVec,vec.z/sizeVec);
	}
	static crossProduct(vec1,vec2){
		return new Vector3(vec1.y * vec2.z - vec1.z * vec2.y,vec1.z * vec2.x - vec1.x * vec2.z,vec1.x * vec2.y - vec1.y * vec2.x);
	}
	static negate(vec){
		return new Vector3(-vec.x,-vec.y,-vec.z);
	}
	static dotProduct(vec1,vec2){
		var result = 0;
		result += vec1.x * vec2.x;
		result += vec1.y * vec2.y;
		result += vec1.z * vec2.z;
		return result;
	}
	static distance(p1,p2){
		return Math.sqrt(Math.pow(p1.x-p2.x,2)+Math.pow(p1.y-p2.y,2)+Math.pow(p1.z-p2.z,2));
	}
	static getMagnitude(vec){
		return Math.sqrt(Math.pow(vec.x,2)+Math.pow(vec.y,2)+Math.pow(vec.z,2));
	}
}


class Billboard{
	constructor(UpperLeft,LowerLeft,UpperRight,LowerRight,imgFile,img,ambient){
		this.UpperLeft=UpperLeft;
		this.LowerLeft=LowerLeft;
		this.UpperRight=UpperRight;
		this.LowerRight=LowerRight;
		this.imgFile=imgFile;
		this.img=img;
		this.ambient=ambient;
	}

	setBuffers(positionBuffer,textureBuffer,normalBuffer,billboardTextureBuffer){
		this.positionBuffer=positionBuffer;
		this.textureBuffer=textureBuffer;
		this.normalBuffer=normalBuffer;
		this.billboardTextureBuffer=billboardTextureBuffer;
	}
}

class SunLight{//Light source
	constructor(locationPoint){
		this.locationPoint=locationPoint;
	}
}

class Camera{
	constructor(position,target,up,fov,far,near,DefaulColor){
		this.position=position;
		this.target=target;
		this.up=up;
		this.fov=fov;//IMPORTANT: It is assumed that FOV is the angle between the center vector and edge of the frustum (half pyramid) but not the entire frustum (full pyramid).
		this.far=far;
		this.near=near;
		this.DefaulColor=DefaulColor;
	}
	setVectors(w,nw,u,v){
		this.w=w;
		this.nw=nw;
		this.u=u;
		this.v=v;
	}
}

class Scene{//This object technically stores everything required for a scene
	constructor(light,billboard,obj,mirror,camera){
		this.light=light;
		this.billboard=billboard;
		this.camera=camera;
		this.obj=obj;
		this.mirror=mirror;
	}
}

class Ray{
	constructor(origin,direction){
		this.origin=origin;
		this.direction=direction;
	}
}

function parseScene(file_data)//A simple function to read JSON and put the data inside a scene class and return the read scene
{
	var sceneFile = JSON.parse(file_data);
	rr = sceneFile.rr;
	let pos=new Vector3(sceneFile.eye[0],sceneFile.eye[1],sceneFile.eye[2]);
	let lookat=new Vector3(sceneFile.lookat[0],sceneFile.lookat[1],sceneFile.lookat[2]);
	let up=new Vector3(sceneFile.up[0],sceneFile.up[1],sceneFile.up[2]);
	let fov=sceneFile.fov_angle;
	let near=sceneFile.near;
	let far=sceneFile.far;
	let DefaulColor=sceneFile.DefaulColor;
	var camera=new Camera(pos,lookat,up,fov,far,near,DefaulColor);
	let light=new SunLight(new Vector3(sceneFile.SunLocation[0],sceneFile.SunLocation[1],sceneFile.SunLocation[2]));
	var billboard;
	if ('billboard' in sceneFile) {//If billboard exists in scene
		let upperLeft=new Vector3(sceneFile.billboard.UpperLeft[0],sceneFile.billboard.UpperLeft[1],sceneFile.billboard.UpperLeft[2]);
		let lowerLeft=new Vector3(sceneFile.billboard.LowerLeft[0],sceneFile.billboard.LowerLeft[1],sceneFile.billboard.LowerLeft[2]);
		let upperRight=new Vector3(sceneFile.billboard.UpperRight[0],sceneFile.billboard.UpperRight[1],sceneFile.billboard.UpperRight[2]);
		let billboardHeight=upperLeft.y-lowerLeft.y;
		let lowerRight=new Vector3(upperRight.x,upperRight.y-billboardHeight,upperRight.z);

		billboard=new Billboard(upperLeft,lowerLeft,upperRight,lowerRight,sceneFile.billboard.filename,null,null);//Image is assigned to billboard later
	}
	var mirror=null;
	var obj=null;
	return new Scene(light,billboard,obj,mirror,camera);
}