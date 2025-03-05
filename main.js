import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Water } from 'three/addons/objects/Water.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { createNoise2D } from 'simplex-noise';

const room = new WebsimSocket();
const noise2D = createNoise2D();
let candles = [];
let water, scene, camera, renderer, controls;
let raycaster, mouse, hoveredCandle = null;
let currentTime = 0;
let isWaterLoaded = false;

// Elements
const createCandleBtn = document.getElementById('create-candle-btn');
const messagePanel = document.getElementById('message-panel');
const messageText = document.getElementById('message-text');
const sendCandleBtn = document.getElementById('send-candle-btn');
const messageView = document.getElementById('message-view');
const messageContent = document.getElementById('message-content');
const messageAuthor = document.getElementById('message-author');
const closeMessageBtn = document.getElementById('close-message-btn');
const loadingOverlay = document.querySelector('.loading-overlay');

// Initialize the scene
init();
animate();

// Event listeners
createCandleBtn.addEventListener('click', () => {
    messagePanel.classList.add('show');
});

sendCandleBtn.addEventListener('click', sendCandle);

closeMessageBtn.addEventListener('click', () => {
    messageView.classList.remove('show');
});

window.addEventListener('mousedown', onMouseDown, false);
window.addEventListener('mousemove', onMouseMove, false);
window.addEventListener('resize', onWindowResize, false);

// Subscribe to candle collection
room.collection('candle').subscribe(updateCandles);

function init() {
    // Initialize scene, camera, renderer
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 1, 20000);
    camera.position.set(0, 30, 100);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.5;
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    
    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 40;
    controls.maxDistance = 500;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    
    // Raycaster for interaction
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    // Water
    const waterGeometry = new THREE.PlaneGeometry(10000, 10000, 100, 100);
    water = new Water(
        waterGeometry,
        {
            textureWidth: 1024,
            textureHeight: 1024,
            waterNormals: new THREE.TextureLoader().load('https://threejs.org/examples/textures/waternormals.jpg', function() {
                isWaterLoaded = true;
                hideLoadingOverlay();
            }),
            sunDirection: new THREE.Vector3(),
            sunColor: 0xffffff,
            waterColor: 0x001e0f,
            distortionScale: 2.7,
            fog: scene.fog !== undefined
        }
    );
    water.rotation.x = -Math.PI / 2;
    scene.add(water);
    
    // Sky
    const sky = new Sky();
    sky.scale.setScalar(10000);
    scene.add(sky);
    
    const skyUniforms = sky.material.uniforms;
    skyUniforms['turbidity'].value = 10;
    skyUniforms['rayleigh'].value = 2;
    skyUniforms['mieCoefficient'].value = 0.005;
    skyUniforms['mieDirectionalG'].value = 0.8;
    
    const sunPosition = new THREE.Vector3(0, 1, 0);
    const parameters = {
        elevation: 2,
        azimuth: 180
    };
    
    const phi = THREE.MathUtils.degToRad(90 - parameters.elevation);
    const theta = THREE.MathUtils.degToRad(parameters.azimuth);
    
    sunPosition.setFromSphericalCoords(1, phi, theta);
    sky.material.uniforms['sunPosition'].value.copy(sunPosition);
    water.material.uniforms['sunDirection'].value.copy(sunPosition).normalize();
    
    // Ambient light
    const ambientLight = new THREE.AmbientLight(0x404040, 2);
    scene.add(ambientLight);
    
    // Directional light (moon)
    const moonLight = new THREE.DirectionalLight(0x8080ff, 0.8);
    moonLight.position.set(-1, 1, -1);
    scene.add(moonLight);
}

function createCandle(candleData) {
    // Candle group
    const candleGroup = new THREE.Group();
    candleGroup.userData = {
        id: candleData.id,
        message: candleData.message,
        username: candleData.username,
        initialPosition: new THREE.Vector3(candleData.posX, 0, candleData.posZ),
        velocity: new THREE.Vector2(candleData.velX, candleData.velZ),
        created_at: candleData.created_at
    };
    
    // Candle body
    const candleGeometry = new THREE.CylinderGeometry(2, 2, 6, 16);
    const candleMaterial = new THREE.MeshPhongMaterial({ color: 0xf3e5ab });
    const candle = new THREE.Mesh(candleGeometry, candleMaterial);
    candle.position.y = 3;
    candleGroup.add(candle);
    
    // Candle base/holder (wider bottom)
    const baseGeometry = new THREE.CylinderGeometry(3, 3, 1, 16);
    const baseMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = -0.5;
    candleGroup.add(base);
    
    // Wick
    const wickGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
    const wickMaterial = new THREE.MeshPhongMaterial({ color: 0x000000 });
    const wick = new THREE.Mesh(wickGeometry, wickMaterial);
    wick.position.y = 6.5;
    candleGroup.add(wick);
    
    // Flame
    const flameGeometry = new THREE.SphereGeometry(0.8, 16, 8);
    const flameMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff9933,
        transparent: true,
        opacity: 0.9
    });
    const flame = new THREE.Mesh(flameGeometry, flameMaterial);
    flame.scale.y = 1.5;
    flame.position.y = 7.5;
    flame.userData.flameIntensity = 1.0;
    flame.userData.baseY = flame.position.y;
    flame.userData.originalScale = flame.scale.clone();
    candleGroup.add(flame);
    
    // Flame glow (light)
    const flameLight = new THREE.PointLight(0xff9933, 1, 50);
    flameLight.position.copy(flame.position);
    candleGroup.add(flameLight);
    
    // Calculate position based on initial position, velocity and time since creation
    const now = new Date();
    const created = new Date(candleData.created_at);
    const elapsedTimeInSeconds = (now - created) / 1000;
    
    const posX = candleData.posX + candleData.velX * elapsedTimeInSeconds;
    const posZ = candleData.posZ + candleData.velZ * elapsedTimeInSeconds;
    
    candleGroup.position.set(posX, 0, posZ);
    
    scene.add(candleGroup);
    candles.push(candleGroup);
    
    return candleGroup;
}

function updateCandles(candlesList) {
    // Remove existing candles
    for (const candle of candles) {
        scene.remove(candle);
    }
    candles = [];
    
    // Add all candles from the collection
    for (const candle of candlesList) {
        createCandle(candle);
    }
    
    // Hide loading overlay once we have candles
    if (isWaterLoaded) {
        hideLoadingOverlay();
    }
}

function hideLoadingOverlay() {
    loadingOverlay.classList.add('hidden');
}

function sendCandle() {
    const message = messageText.value.trim();
    if (!message) {
        alert("Please write a message for your candle");
        return;
    }
    
    // Generate random position and velocity
    const posX = (Math.random() - 0.5) * 300;
    const posZ = (Math.random() - 0.5) * 300;
    
    // Random velocity (magnitude between 1 and 3)
    const speed = 1 + Math.random() * 2;
    const angle = Math.random() * Math.PI * 2;
    const velX = Math.cos(angle) * speed;
    const velZ = Math.sin(angle) * speed;
    
    // Save candle to the database
    room.collection('candle').create({
        message: message,
        posX: posX,
        posZ: posZ,
        velX: velX,
        velZ: velZ
    }).then(() => {
        // Hide the message panel only after successfully creating the candle
        messagePanel.classList.remove('show');
        messageText.value = '';
    }).catch(error => {
        console.error("Error creating candle:", error);
        alert("There was an error sending your candle. Please try again.");
    });
}

function onMouseDown(event) {
    event.preventDefault();
    
    // Calculate mouse position
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Check for intersections
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    
    // Check if we clicked on a candle
    for (let i = 0; i < intersects.length; i++) {
        let parent = intersects[i].object;
        
        // Find the candle group that contains this object
        while (parent && !parent.userData.id) {
            parent = parent.parent;
        }
        
        if (parent && parent.userData.id) {
            // Show the message
            messageContent.textContent = parent.userData.message;
            messageAuthor.textContent = `— ${parent.userData.username}`;
            messageView.classList.add('show');
            break;
        }
    }
}

function onMouseMove(event) {
    event.preventDefault();
    
    // Calculate mouse position
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    // Check for intersections
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    
    // Reset hover state
    document.body.style.cursor = 'auto';
    if (hoveredCandle) {
        hoveredCandle = null;
    }
    
    // Check if we are hovering over a candle
    for (let i = 0; i < intersects.length; i++) {
        let parent = intersects[i].object;
        
        // Find the candle group that contains this object
        while (parent && !parent.userData.id) {
            parent = parent.parent;
        }
        
        if (parent && parent.userData.id) {
            document.body.style.cursor = 'pointer';
            hoveredCandle = parent;
            break;
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    
    currentTime += 0.01;
    
    // Update water - slower speed for more realistic movement
    water.material.uniforms['time'].value += 1.0 / 120.0;
    
    // Update candles - physics and flame effects
    for (const candle of candles) {
        // Update position based on velocity
        const userData = candle.userData;
        candle.position.x += userData.velocity.x * 0.016; // 0.016 is approximately 1/60 (60fps)
        candle.position.z += userData.velocity.y * 0.016;
        
        // Bobbing effect using noise
        const noiseValue = noise2D(
            candle.position.x * 0.01 + currentTime * 0.05,
            candle.position.z * 0.01 + currentTime * 0.05
        );
        
        // Apply bobbing to the y position
        candle.position.y = noiseValue * 2;
        
        // Apply gentle rotation from waves
        candle.rotation.x = noiseValue * 0.1;
        candle.rotation.z = noiseValue * 0.1;
        
        // Animate flame
        if (candle.children.length > 3) {
            const flame = candle.children[3];
            const flameLight = candle.children[4];
            
            // Random flickering
            const flicker = 0.9 + Math.random() * 0.2;
            flame.scale.set(
                flame.userData.originalScale.x * flicker,
                flame.userData.originalScale.y * flicker,
                flame.userData.originalScale.z * flicker
            );
            
            // Update light intensity to match flame
            flameLight.intensity = 1.0 * flicker;
            
            // Slight vertical movement
            flame.position.y = flame.userData.baseY + Math.sin(currentTime * 5 + candle.position.x) * 0.1;
        }
    }
    
    controls.update();
    renderer.render(scene, camera);
}