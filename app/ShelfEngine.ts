import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import type { CatalogBook } from "./catalog";
import {
  bookFootprintsOverlap,
  browseMotionPose,
  browsePhaseDuration,
  createMotionLayout,
  focusedBookPose,
  presentedBookPose,
  shelvedBookPose,
  type BookFootprint,
  type BookPose,
  type BrowseMotionPhase,
  type MotionLayout,
} from "./book-motion";
import {
  createBackCover,
  createFrontCover,
  createSpineCover,
  createTitleDecal,
} from "./cover-art";
import {
  STRIPE_ASSET_ROOT,
  stripeAssetUrl,
  type StripeBookAsset,
} from "./stripe-assets";
import {
  addStripeFoilBlend,
  stripeFoilSettings,
} from "./stripe-foil";
import {
  adjacentShelfBookIndex,
  cabinetBaseTop,
  cabinetBookInsetZ,
  cabinetShelfThickness,
  cabinetSideThickness,
  cabinetRowSpacing,
  centeredShelfBookIndex,
  createCabinetLayout,
  type CabinetLayout,
  type ShelfBookPlacement,
} from "./shelf-layout";
import { siteConfig } from "./site-config";

export type ShelfMode = "browse" | "focusing" | "inspect" | "returning";
export type BrowseScope = "wall" | "shelf";

type ShelfCallbacks = {
  onActiveIndex: (index: number) => void;
  onMode: (mode: ShelfMode, selectedIndex: number | null) => void;
  onBrowseScope: (scope: BrowseScope, row: number | null) => void;
  onPhotoFocus: (open: boolean) => void;
  onStatus: (message: string) => void;
  onReady: () => void;
};

type RuntimeBook = {
  data: CatalogBook;
  index: number;
  slot: THREE.Group;
  content: THREE.Group;
  inspectionIdle: THREE.Group;
  physical: THREE.Group;
  assetHolder: THREE.Group;
  frontSurface: THREE.Mesh<
    THREE.PlaneGeometry,
    THREE.MeshPhysicalMaterial
  >;
  titleDecal: THREE.Mesh;
  pickProxy: THREE.Mesh;
  livingMaterial?: THREE.ShaderMaterial;
  row: number;
  x: number;
  shelfTilt: number;
  width: number;
  pose: BookPose;
  hover: number;
  targetHover: number;
  idleAmount: number;
  textures: THREE.Texture[];
  lazyTextures: THREE.Texture[];
  backSurface: THREE.Mesh;
};

const browseCamera = new THREE.Vector3(0, 1.42, 6.65);
const browseTarget = new THREE.Vector3(0, 1.28, 0.15);
const pageColor = new THREE.Color("#e9dfca");
const walnutColor = new THREE.Color("#f4e6da");
const walnutEdgeColor = new THREE.Color("#3f291e");
const clamp = THREE.MathUtils.clamp;
const focusInDuration = 0.46;
const focusOutDuration = 0.34;
const desktopDetailWidthRatio = 0.41;
const compactDetailWidthRatio = 0.48;
const desktopDetailMaxWidth = 620;
const compactDetailMaxWidth = 570;
const desktopFocusX = -0.58;
const desktopFocusZ = 1.66;
const desktopFocusScale = 1.08;
const mobileFocusZ = 1.4;
const mobileFocusScale = 0.92;
const inspectionIdleLift = 0.014;
const inspectionIdlePitch = THREE.MathUtils.degToRad(0.28);
const inspectionIdleYaw = THREE.MathUtils.degToRad(0.48);
const inspectionIdleRoll = THREE.MathUtils.degToRad(0.22);

// Downloaded Stripe OBJ basis: X = thickness, Y = up/height, Z = width,
// and the front cover is on +X. Rotating -90° maps that cover to world +Z,
// toward the browse camera.
const stripeBookCoverFacingRotationY = -Math.PI / 2;

function damp(current: number, target: number, lambda: number, delta: number) {
  return THREE.MathUtils.damp(current, target, lambda, delta);
}

function easeOutCubic(value: number) {
  const t = 1 - clamp(value, 0, 1);
  return 1 - t * t * t;
}

function loadWalnutTexture(
  renderer: THREE.WebGLRenderer,
  rotation = 0,
  repeatX = 1,
  repeatY = 1,
) {
  const texture = new THREE.TextureLoader().load("/walnut-shelf-texture.png");
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.center.set(0.5, 0.5);
  texture.rotation = rotation;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function toTexture(
  canvas: HTMLCanvasElement,
  renderer: THREE.WebGLRenderer,
  anisotropy = 8,
) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(
    anisotropy,
    renderer.capabilities.getMaxAnisotropy(),
  );
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

function createLivingMaterial(color: string) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uStrength: { value: 0 },
      uColor: { value: new THREE.Color(color) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform float uStrength;
      uniform vec3 uColor;

      void main() {
        float diagonal = fract(vUv.x * 0.72 + vUv.y * 0.31 + uTime * 0.045);
        float sheen = smoothstep(0.44, 0.5, diagonal) * (1.0 - smoothstep(0.5, 0.57, diagonal));
        float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
        float alpha = sheen * edge * uStrength * 0.32;
        gl_FragColor = vec4(uColor, alpha);
      }
    `,
  });
}

export class ShelfEngine {
  private canvas: HTMLCanvasElement;
  private booksData: CatalogBook[];
  private callbacks: ShelfCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private shelfGroup = new THREE.Group();
  private shelfFurniture = new THREE.Group();
  private wallCabinet = new THREE.Group();
  private focusShelfBoards: THREE.Group[] = [];
  private focusedShelfRow: number | null = null;
  private cabinetLayout: CabinetLayout | null = null;
  private runtimeBooks: RuntimeBook[] = [];
  private pickTargets: THREE.Object3D[] = [];
  private shelfPickTargets: THREE.Object3D[] = [];
  private photoPickTargets: THREE.Object3D[] = [];
  private shelfTextures: THREE.Texture[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(10, 10);
  private animationFrame = 0;
  private resizeObserver: ResizeObserver;
  private mode: ShelfMode = "browse";
  private browseScope: BrowseScope = "wall";
  private selectedIndex: number | null = null;
  private activeIndex = 0;
  private presentedIndex: number | null = null;
  private pendingFocusIndex: number | null = null;
  private browseMotionPhase: BrowseMotionPhase | "idle" = "idle";
  private browseMotionProgress = 0;
  private motionBookIndex: number | null = null;
  private motionLayout: MotionLayout = createMotionLayout([]);
  private collisionRejects = 0;
  private lastCollisionPair: [string, string] | null = null;
  private scrollIndex = 0;
  private targetScrollIndex = 0;
  private focusProgress = 0;
  private lastInputTime = 0;
  private pointerDown = false;
  private pointerId: number | null = null;
  private pointerStartX = 0;
  private pointerStartY = 0;
  private pointerLastX = 0;
  private pointerLastY = 0;
  private pointerTravel = 0;
  private dragAxis: "horizontal" | "vertical" | null = null;
  private wheelAccumulator = 0;
  private lastWheelInputAt = 0;
  private wheelLockedUntil = 0;
  private reducedMotion = false;
  private assetCount = 0;
  private assetFailures = 0;
  private stripeTextureCache = new Map<
    string,
    Promise<THREE.Texture | null>
  >();
  private stripeTextures = new Set<THREE.Texture>();
  private stripeGeometry: THREE.BufferGeometry | null = null;
  private stripeGeometrySize = new THREE.Vector3();
  private focusCameraPosition = new THREE.Vector3();
  private focusCameraTarget = new THREE.Vector3();
  private responsiveBrowseCamera = browseCamera.clone();
  private responsiveBrowseTarget = browseTarget.clone();
  private lastTimestamp = 0;
  private lastDiagnosticsAt = 0;
  private isDisposed = false;

  constructor(
    canvas: HTMLCanvasElement,
    books: CatalogBook[],
    callbacks: ShelfCallbacks,
  ) {
    this.canvas = canvas;
    this.booksData = books;
    this.callbacks = callbacks;
    this.reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.03;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(27, 1, 0.08, 80);
    this.camera.position.copy(browseCamera);
    this.camera.lookAt(browseTarget);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enabled = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.enableZoom = true;
    this.controls.minDistance = 2.7;
    this.controls.maxDistance = 7.2;
    this.controls.minPolarAngle = Math.PI * 0.22;
    this.controls.maxPolarAngle = Math.PI * 0.78;

    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.setupScene();
    this.createBooks();
    this.centerInitialShelf();
    this.bindEvents();
    this.resizeObserver.observe(canvas);
    this.handleResize();
    this.callbacks.onReady();
    this.callbacks.onStatus(`${this.booksData.length} volumes ready`);
    this.animate();
    if (siteConfig.enableOptionalStripeArchive) {
      void this.loadStripeAssets();
    }

    (
      window as unknown as {
        __PRESS_LIBRARY__?: {
          diagnostics: () => ReturnType<ShelfEngine["getDiagnostics"]>;
          focus: (index: number) => void;
          browse: (index: number) => void;
          showWall: () => void;
          returnToShelf: () => void;
        };
      }
    ).__PRESS_LIBRARY__ = {
      diagnostics: () => this.getDiagnostics(),
      focus: (index) => this.focusBook(index),
      browse: (index) => this.browseTo(index),
      showWall: () => this.showWall(),
      returnToShelf: () => this.returnToShelf(),
    };
  }

  private setupScene() {
    this.scene.background = new THREE.Color("#eee8db");
    this.scene.fog = new THREE.Fog("#eee8db", 18, 60);

    const hemisphere = new THREE.HemisphereLight("#fff8ea", "#6e5848", 2.4);
    this.scene.add(hemisphere);

    const key = new THREE.DirectionalLight("#fff6e7", 4.6);
    key.position.set(-4.2, 7.4, 5.5);
    key.castShadow = true;
    key.shadow.mapSize.set(
      window.innerWidth < 700 ? 1024 : 2048,
      window.innerWidth < 700 ? 1024 : 2048,
    );
    key.shadow.camera.left = -11;
    key.shadow.camera.right = 11;
    key.shadow.camera.top = 9;
    key.shadow.camera.bottom = -9;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 22;
    key.shadow.bias = -0.0005;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight("#c8d5e5", 2.1);
    rim.position.set(5, 3, -4);
    this.scene.add(rim);

    const warmBounce = new THREE.PointLight("#d79b72", 1.2, 10, 2);
    warmBounce.position.set(-3, 0.4, 3.2);
    this.scene.add(warmBounce);

    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 28),
      new THREE.MeshStandardMaterial({
        color: "#eee8db",
        roughness: 1,
        metalness: 0,
      }),
    );
    wall.position.set(0, 4, -1.34);
    wall.receiveShadow = true;
    this.scene.add(wall);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(36, 18),
      new THREE.MeshStandardMaterial({
        color: "#e7dfd0",
        roughness: 0.94,
        metalness: 0,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -7.4;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.scene.add(this.shelfGroup);
    this.shelfGroup.add(this.shelfFurniture);
    this.shelfFurniture.add(this.wallCabinet);
  }

  private createBooks() {
    const cabinetLayout = createCabinetLayout(this.booksData);
    this.cabinetLayout = cabinetLayout;

    this.booksData.forEach((book, index) => {
      const runtime = this.createBook(
        book,
        index,
        cabinetLayout.placements[index],
      );
      this.runtimeBooks.push(runtime);
      this.shelfGroup.add(runtime.slot);
      if (book.coverImage) {
        void this.loadCustomCover(runtime, book.coverImage);
      }
    });

    this.motionLayout = createMotionLayout(
      this.runtimeBooks.map((book) => ({
        width: book.width,
        thickness: book.data.thickness,
      })),
    );
    this.runtimeBooks.forEach((book) => {
      this.commitBookPose(book, shelvedBookPose(this.motionLayout), false);
    });

    this.createShelves(cabinetLayout);
  }

  private createShelves(layout: CabinetLayout) {
    const horizontalTexture = loadWalnutTexture(this.renderer, 0, 4.4, 1.1);
    const verticalTexture = loadWalnutTexture(
      this.renderer,
      Math.PI * 0.5,
      3.2,
      1,
    );
    this.shelfTextures.push(horizontalTexture, verticalTexture);

    const horizontalMaterial = new THREE.MeshPhysicalMaterial({
      map: horizontalTexture,
      color: walnutColor,
      emissive: new THREE.Color("#4b2b1b"),
      emissiveIntensity: 0.32,
      roughness: 0.62,
      metalness: 0.01,
      clearcoat: 0.08,
      clearcoatRoughness: 0.72,
    });
    const verticalMaterial = horizontalMaterial.clone();
    verticalMaterial.map = verticalTexture;
    const edgeMaterial = new THREE.MeshPhysicalMaterial({
      color: walnutEdgeColor,
      roughness: 0.58,
      clearcoat: 0.08,
      clearcoatRoughness: 0.68,
    });
    const boardDepth = 1.62;
    const boardZ = -0.42;

    const addCabinetBoard = (
      name: string,
      width: number,
      height: number,
      x: number,
      y: number,
      material: THREE.Material,
    ) => {
      const board = new THREE.Mesh(
        new RoundedBoxGeometry(width, height, boardDepth, 4, 0.025),
        material,
      );
      board.name = name;
      board.position.set(x, y, boardZ);
      board.castShadow = true;
      board.receiveShadow = true;
      this.wallCabinet.add(board);
    };

    for (let boundary = 0; boundary <= layout.wallRowCount; boundary += 1) {
      const surfaceY = cabinetBaseTop + boundary * layout.cellHeight;
      const isTop = boundary === layout.wallRowCount;
      addCabinetBoard(
        `walnutCabinetHorizontal:${boundary}`,
        layout.outerWidth,
        cabinetShelfThickness,
        0,
        surfaceY + (isTop ? 1 : -1) * cabinetShelfThickness * 0.5,
        horizontalMaterial,
      );
    }

    const cabinetBodyHeight =
      layout.wallRowCount * layout.cellHeight + cabinetShelfThickness * 2;
    const cabinetCenterY =
      cabinetBaseTop + layout.wallRowCount * layout.cellHeight * 0.5;
    [-1, 1].forEach((side) => {
      addCabinetBoard(
        `walnutCabinetSide:${side}`,
        cabinetSideThickness,
        cabinetBodyHeight,
        side * (layout.interiorWidth * 0.5 + cabinetSideThickness * 0.5),
        cabinetCenterY,
        verticalMaterial,
      );
    });
    for (let column = 1; column < layout.wallColumnCount; column += 1) {
      addCabinetBoard(
        `walnutCabinetDivider:${column}`,
        cabinetSideThickness,
        layout.wallRowCount * layout.cellHeight,
        -layout.interiorWidth * 0.5 + column * layout.cellWidth,
        cabinetCenterY,
        verticalMaterial,
      );
    }

    layout.shelfSurfaceYs.forEach((surfaceY, row) => {
      const shelfCenterX = layout.shelfCenterXs[row];
      const focusShelfWidth = layout.outerWidth;
      const focusShelf = new THREE.Group();
      focusShelf.name = `singleShelfFocus:${row}`;
      focusShelf.visible = false;

      const focusBoard = new THREE.Mesh(
        new RoundedBoxGeometry(
          focusShelfWidth,
          0.18,
          1.48,
          4,
          0.035,
        ),
        horizontalMaterial,
      );
      focusBoard.name = `singleWalnutShelf:${row}`;
      focusBoard.position.set(shelfCenterX, surfaceY - 0.11, -0.34);
      focusBoard.castShadow = true;
      focusBoard.receiveShadow = true;
      focusShelf.add(focusBoard);

      const focusEdge = new THREE.Mesh(
        new RoundedBoxGeometry(
          focusShelfWidth - 0.12,
          0.075,
          0.08,
          3,
          0.016,
        ),
        edgeMaterial,
      );
      focusEdge.name = `singleWalnutShelfEdge:${row}`;
      focusEdge.position.set(shelfCenterX, surfaceY - 0.085, 0.38);
      focusEdge.castShadow = true;
      focusShelf.add(focusEdge);
      this.shelfFurniture.add(focusShelf);
      this.focusShelfBoards[row] = focusShelf;

      const shelfPickProxy = new THREE.Mesh(
        new THREE.BoxGeometry(
          layout.cellWidth - cabinetSideThickness,
          layout.cellHeight - cabinetShelfThickness,
          1.5,
        ),
        new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        }),
      );
      shelfPickProxy.name = `shelfPick:${row}`;
      shelfPickProxy.userData.shelfRow = row;
      shelfPickProxy.position.set(
        shelfCenterX,
        surfaceY + layout.cellHeight * 0.5,
        -0.34,
      );
      this.wallCabinet.add(shelfPickProxy);
      this.shelfPickTargets.push(shelfPickProxy);
    });

    this.createShelfDecor(layout);
  }

  private createShelfDecor(layout: CabinetLayout) {
    const occupiedCells = new Set(layout.cellIndexes);
    const emptyCells = Array.from(
      { length: layout.wallCellCount },
      (_, cellIndex) => cellIndex,
    ).filter((cellIndex) => !occupiedCells.has(cellIndex));
    if (!emptyCells.length) return;
    const photoCell = emptyCells.reduce((closest, cellIndex) =>
      Math.abs(cellIndex - (layout.wallCellCount - 1) * 0.5) <
      Math.abs(closest - (layout.wallCellCount - 1) * 0.5)
        ? cellIndex
        : closest,
    );

    emptyCells.forEach((cellIndex, decorIndex) => {
      const column = cellIndex % layout.wallColumnCount;
      const band = Math.floor(cellIndex / layout.wallColumnCount);
      const centerX =
        (column - (layout.wallColumnCount - 1) * 0.5) * layout.cellWidth;
      const surfaceY =
        cabinetBaseTop +
        (layout.wallRowCount - band - 1) * layout.cellHeight;
      const decor =
        cellIndex === photoCell
          ? this.createPhotoFrame()
          : decorIndex % 3 === 0
            ? this.createCeramicVase(decorIndex)
            : decorIndex % 3 === 1
              ? this.createSculpture(decorIndex)
              : this.createHorizontalBookStack(decorIndex);
      decor.name =
        cellIndex === photoCell
          ? `familyPhotoFrame:${cellIndex}`
          : `shelfDecor:${cellIndex}`;
      decor.position.set(
        centerX + ((cellIndex % 3) - 1) * 0.16,
        surfaceY,
        0.02,
      );
      this.wallCabinet.add(decor);
    });
  }

  private createPhotoFrame() {
    const group = new THREE.Group();
    const photoTexture = new THREE.TextureLoader().load(
      "/family-shelf-photo.jpg",
    );
    photoTexture.colorSpace = THREE.SRGBColorSpace;
    photoTexture.anisotropy = Math.min(
      8,
      this.renderer.capabilities.getMaxAnisotropy(),
    );
    this.shelfTextures.push(photoTexture);

    const frameMaterial = new THREE.MeshPhysicalMaterial({
      color: "#b08a50",
      roughness: 0.42,
      metalness: 0.34,
      clearcoat: 0.18,
      clearcoatRoughness: 0.48,
    });
    const backing = new THREE.Mesh(
      new RoundedBoxGeometry(1.32, 1.32, 0.075, 3, 0.018),
      new THREE.MeshStandardMaterial({
        color: "#2e241d",
        roughness: 0.74,
      }),
    );
    backing.position.set(0, 0.72, -0.015);
    backing.castShadow = true;
    group.add(backing);

    const photo = new THREE.Mesh(
      new THREE.PlaneGeometry(1.12, 1.12),
      new THREE.MeshBasicMaterial({ map: photoTexture }),
    );
    photo.position.set(0, 0.72, 0.03);
    group.add(photo);

    const photoPickProxy = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 1.5, 0.22),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    photoPickProxy.name = "familyPhotoPick";
    photoPickProxy.position.set(0, 0.72, 0.08);
    group.add(photoPickProxy);
    this.photoPickTargets.push(photoPickProxy);

    const horizontalBarGeometry = new RoundedBoxGeometry(
      1.46,
      0.095,
      0.105,
      3,
      0.018,
    );
    const verticalBarGeometry = new RoundedBoxGeometry(
      0.095,
      1.28,
      0.105,
      3,
      0.018,
    );
    [-1, 1].forEach((direction) => {
      const horizontal = new THREE.Mesh(
        horizontalBarGeometry,
        frameMaterial,
      );
      horizontal.position.set(0, 0.72 + direction * 0.68, 0.075);
      horizontal.castShadow = true;
      group.add(horizontal);

      const vertical = new THREE.Mesh(verticalBarGeometry, frameMaterial);
      vertical.position.set(direction * 0.68, 0.72, 0.075);
      vertical.castShadow = true;
      group.add(vertical);
    });
    group.rotation.y = -0.055;
    return group;
  }

  private createCeramicVase(variant: number) {
    const group = new THREE.Group();
    const profile = [
      new THREE.Vector2(0.18, 0),
      new THREE.Vector2(0.29, 0.08),
      new THREE.Vector2(0.34, 0.42),
      new THREE.Vector2(0.25, 0.78),
      new THREE.Vector2(0.17, 0.92),
      new THREE.Vector2(0.16, 1.1),
      new THREE.Vector2(0.22, 1.14),
    ];
    const vase = new THREE.Mesh(
      new THREE.LatheGeometry(profile, 32),
      new THREE.MeshPhysicalMaterial({
        color: variant % 2 === 0 ? "#6f887b" : "#b9795f",
        roughness: 0.32,
        metalness: 0,
        clearcoat: 0.28,
        clearcoatRoughness: 0.36,
      }),
    );
    vase.castShadow = true;
    vase.receiveShadow = true;
    group.add(vase);
    this.addFlowersToVase(group, variant);
    return group;
  }

  private addFlowersToVase(group: THREE.Group, variant: number) {
    const stemMaterial = new THREE.MeshStandardMaterial({
      color: "#456846",
      roughness: 0.76,
    });
    const leafMaterial = new THREE.MeshStandardMaterial({
      color: variant % 2 === 0 ? "#5f805c" : "#61794f",
      roughness: 0.72,
    });
    const petalColors =
      variant % 2 === 0
        ? ["#e9aa96", "#f4d2c0", "#d98977", "#f0bfab", "#df9d8d"]
        : ["#e9bd4f", "#f5d578", "#d99c38", "#f0ca63", "#e4ae45"];

    [
      { x: -0.2, z: -0.01, height: 0.66, lean: 0.2 },
      { x: -0.09, z: 0.015, height: 0.82, lean: 0.1 },
      { x: 0, z: 0.035, height: 0.91, lean: 0 },
      { x: 0.1, z: 0.015, height: 0.77, lean: -0.1 },
      { x: 0.2, z: -0.01, height: 0.62, lean: -0.2 },
    ].forEach((stemSpec, flowerIndex) => {
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.018, stemSpec.height, 8),
        stemMaterial,
      );
      stem.name = `flowerStem:${flowerIndex}`;
      stem.position.set(
        stemSpec.x,
        1.11 + stemSpec.height * 0.5,
        stemSpec.z,
      );
      stem.rotation.z = stemSpec.lean;
      stem.castShadow = true;
      group.add(stem);

      [0.36, 0.58].forEach((heightRatio, leafIndex) => {
        const leaf = new THREE.Mesh(
          new THREE.SphereGeometry(0.082, 12, 8),
          leafMaterial,
        );
        const side = (flowerIndex + leafIndex) % 2 === 0 ? -1 : 1;
        leaf.name = `flowerLeaf:${flowerIndex}:${leafIndex}`;
        leaf.scale.set(0.55, 1.65, 0.38);
        leaf.position.set(
          stemSpec.x + side * 0.06,
          1.11 + stemSpec.height * heightRatio,
          stemSpec.z + 0.014,
        );
        leaf.rotation.z = stemSpec.lean + side * 0.72;
        leaf.castShadow = true;
        group.add(leaf);
      });

      const blossom = new THREE.Group();
      blossom.name = `flowerBlossom:${flowerIndex}`;
      blossom.position.set(
        stemSpec.x - Math.sin(stemSpec.lean) * stemSpec.height * 0.45,
        1.11 + stemSpec.height,
        stemSpec.z + 0.025,
      );
      const petalMaterial = new THREE.MeshPhysicalMaterial({
        color: petalColors[flowerIndex],
        roughness: 0.55,
        clearcoat: 0.06,
      });
      for (let petalIndex = 0; petalIndex < 6; petalIndex += 1) {
        const angle = (petalIndex / 6) * Math.PI * 2;
        const petal = new THREE.Mesh(
          new THREE.SphereGeometry(0.105, 12, 8),
          petalMaterial,
        );
        petal.name = `flowerPetal:${flowerIndex}:${petalIndex}`;
        petal.scale.set(0.68, 1.2, 0.46);
        petal.position.set(
          Math.cos(angle) * 0.105,
          Math.sin(angle) * 0.105,
          0,
        );
        petal.rotation.z = angle - Math.PI * 0.5;
        petal.castShadow = true;
        blossom.add(petal);
      }
      const flowerCenter = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 12, 8),
        new THREE.MeshStandardMaterial({
          color: "#8f6330",
          roughness: 0.64,
        }),
      );
      flowerCenter.position.z = 0.04;
      blossom.add(flowerCenter);
      group.add(blossom);
    });
  }

  private createSculpture(variant: number) {
    const group = new THREE.Group();
    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: variant % 2 === 0 ? "#d0c1a8" : "#78918f",
      roughness: 0.66,
      metalness: 0.02,
    });
    const pedestal = new THREE.Mesh(
      new RoundedBoxGeometry(0.72, 0.16, 0.54, 3, 0.035),
      new THREE.MeshStandardMaterial({
        color: "#9a7652",
        roughness: 0.72,
      }),
    );
    pedestal.position.y = 0.08;
    pedestal.castShadow = true;
    group.add(pedestal);

    const sculpture = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.27, 0.08, 64, 10, 2, 3),
      stoneMaterial,
    );
    sculpture.position.y = 0.62;
    sculpture.rotation.set(0.32, 0.4 + variant * 0.08, -0.18);
    sculpture.castShadow = true;
    group.add(sculpture);
    return group;
  }

  private createHorizontalBookStack(variant: number) {
    const group = new THREE.Group();
    const colors = ["#7b3f32", "#c09b4b", "#456a6d"];
    colors.forEach((color, index) => {
      const book = new THREE.Mesh(
        new RoundedBoxGeometry(1.28 - index * 0.08, 0.14, 0.82, 3, 0.025),
        new THREE.MeshPhysicalMaterial({
          color,
          roughness: 0.72,
          clearcoat: 0.04,
        }),
      );
      book.position.set((index - 1) * 0.04, 0.07 + index * 0.145, 0);
      book.rotation.y = (index - 1) * 0.055 + variant * 0.008;
      book.castShadow = true;
      book.receiveShadow = true;
      group.add(book);
    });
    return group;
  }

  private centerInitialShelf() {
    const initialIndex = centeredShelfBookIndex(this.runtimeBooks);
    this.activeIndex = initialIndex;
    this.scrollIndex = initialIndex;
    this.targetScrollIndex = initialIndex;
    this.callbacks.onActiveIndex(initialIndex);
    this.callbacks.onBrowseScope("wall", null);
  }

  private createBook(
    book: CatalogBook,
    index: number,
    placement: ShelfBookPlacement,
  ): RuntimeBook {
    const width = 1.31 + ((index % 5) - 2) * 0.018;
    const depth = book.thickness;
    const slot = new THREE.Group();
    slot.name = `bookSlot:${book.id}`;
    slot.position.set(placement.x, placement.y, cabinetBookInsetZ);
    slot.rotation.z = placement.tilt;

    const content = new THREE.Group();
    content.name = `bookPresentation:${book.id}`;
    slot.add(content);
    const pose = shelvedBookPose(this.motionLayout);
    content.position.set(pose.x, 0, pose.z);
    content.rotation.y = pose.yaw;
    content.scale.setScalar(pose.scale);

    const inspectionIdle = new THREE.Group();
    inspectionIdle.name = `bookInspectionIdle:${book.id}`;
    content.add(inspectionIdle);

    const physical = new THREE.Group();
    physical.name = `proceduralBook:${book.id}`;
    inspectionIdle.add(physical);

    const assetHolder = new THREE.Group();
    assetHolder.name = `stripePressBook:${book.id}`;
    inspectionIdle.add(assetHolder);

    const boardMaterial = new THREE.MeshPhysicalMaterial({
      color: book.cover,
      roughness: 0.78,
      metalness: 0,
      sheen: 0.36,
      sheenColor: new THREE.Color(book.ink),
      sheenRoughness: 0.82,
      clearcoat: book.motif === "gather" ? 0.12 : 0.03,
      clearcoatRoughness: 0.7,
    });
    const paperMaterial = new THREE.MeshStandardMaterial({
      color: pageColor,
      roughness: 0.88,
      metalness: 0,
    });

    const pageBlock = new THREE.Mesh(
      new RoundedBoxGeometry(
        width - 0.075,
        book.height - 0.105,
        Math.max(0.08, depth - 0.052),
        3,
        0.018,
      ),
      paperMaterial,
    );
    pageBlock.name = "pageBlock";
    pageBlock.castShadow = true;
    pageBlock.receiveShadow = true;
    physical.add(pageBlock);

    const boardGeometry = new RoundedBoxGeometry(
      width,
      book.height,
      0.034,
      4,
      0.025,
    );
    const frontBoard = new THREE.Mesh(boardGeometry, boardMaterial);
    frontBoard.name = "frontBoard";
    frontBoard.position.z = depth * 0.5;
    frontBoard.castShadow = true;
    frontBoard.receiveShadow = true;
    physical.add(frontBoard);

    const backBoard = new THREE.Mesh(boardGeometry, boardMaterial);
    backBoard.name = "backBoard";
    backBoard.position.z = -depth * 0.5;
    backBoard.castShadow = true;
    backBoard.receiveShadow = true;
    physical.add(backBoard);

    const spine = new THREE.Mesh(
      new RoundedBoxGeometry(0.055, book.height - 0.01, depth + 0.012, 3, 0.018),
      boardMaterial,
    );
    spine.name = "spine";
    spine.position.x = -width * 0.5 + 0.022;
    spine.castShadow = true;
    physical.add(spine);

    const headbandMaterial = new THREE.MeshPhysicalMaterial({
      color: book.accent,
      roughness: 0.62,
      metalness: 0.2,
    });
    const headbandGeometry = new THREE.CylinderGeometry(0.017, 0.017, width - 0.1, 10);
    headbandGeometry.rotateZ(Math.PI / 2);
    const headbandTop = new THREE.Mesh(headbandGeometry, headbandMaterial);
    headbandTop.position.set(0, book.height * 0.5 - 0.045, 0);
    physical.add(headbandTop);
    const headbandBottom = headbandTop.clone();
    headbandBottom.position.y = -book.height * 0.5 + 0.045;
    physical.add(headbandBottom);

    // Front and spine textures are needed during browse; back cover and
    // title decal are lazily generated on first focus (see ensureInspectionTextures).
    const frontTexture = toTexture(createFrontCover(book), this.renderer);
    const spineTexture = toTexture(createSpineCover(book), this.renderer, 4);
    const textures = [frontTexture, spineTexture];

    const frontSurface = new THREE.Mesh<
      THREE.PlaneGeometry,
      THREE.MeshPhysicalMaterial
    >(
      new THREE.PlaneGeometry(width - 0.065, book.height - 0.065),
      new THREE.MeshPhysicalMaterial({
        map: frontTexture,
        roughness: 0.66,
        metalness: 0.02,
        clearcoat: book.motif === "gather" ? 0.18 : 0.05,
        clearcoatRoughness: 0.48,
      }),
    );
    frontSurface.name = "frontArtwork";
    frontSurface.position.z = depth * 0.5 + 0.019;
    physical.add(frontSurface);

    const titleDecal = new THREE.Mesh(
      new THREE.PlaneGeometry(width - 0.065, book.height - 0.065),
     new THREE.MeshBasicMaterial({
        map: null,
       transparent: true,
        alphaTest: 0.02,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    titleDecal.name = "accurateTitleDecal";
    titleDecal.position.z = depth * 0.5 + 0.026;
    titleDecal.visible = false;
    inspectionIdle.add(titleDecal);

    const backSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(width - 0.065, book.height - 0.065),
     new THREE.MeshStandardMaterial({
        map: null,
       roughness: 0.72,
      }),
    );
    backSurface.name = "backArtwork";
    backSurface.position.z = -depth * 0.5 - 0.019;
    backSurface.rotation.y = Math.PI;
    physical.add(backSurface);

    const spineSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(depth - 0.02, book.height - 0.04),
      new THREE.MeshPhysicalMaterial({
        map: spineTexture,
        roughness: 0.68,
        metalness: 0.015,
      }),
    );
    spineSurface.name = "spineArtwork";
    spineSurface.rotation.y = -Math.PI / 2;
    spineSurface.position.x = -width * 0.5 - 0.019;
    physical.add(spineSurface);

    let livingMaterial: THREE.ShaderMaterial | undefined;
    if (book.living) {
      livingMaterial = createLivingMaterial(book.accent);
      const shimmer = new THREE.Mesh(
        new THREE.PlaneGeometry(width - 0.07, book.height - 0.07),
        livingMaterial,
      );
      shimmer.name = "livingCoverShimmer";
      shimmer.position.z = depth * 0.5 + 0.034;
      inspectionIdle.add(shimmer);
    }

    const pickProxy = new THREE.Mesh(
      new THREE.BoxGeometry(width, book.height, depth + 0.07),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    pickProxy.name = `pick:${book.id}`;
    pickProxy.userData.bookIndex = index;
    inspectionIdle.add(pickProxy);
    this.pickTargets.push(pickProxy);

    return {
      data: book,
      index,
      slot,
      content,
      inspectionIdle,
      physical,
      assetHolder,
      frontSurface,
      titleDecal,
      pickProxy,
      livingMaterial,
      backSurface,
      row: placement.row,
      x: placement.x,
      shelfTilt: placement.tilt,
      width,
      pose,
      hover: 0,
      targetHover: 0,
      idleAmount: 0,
      textures,
      lazyTextures: [],
    };
  }

  private bindEvents() {
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerCancel);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("blur", this.handleWindowBlur);
  }

  private handleWheel = (event: WheelEvent) => {
    if (this.mode !== "browse" || this.browseScope === "wall") return;
    event.preventDefault();
    this.pendingFocusIndex = null;
    const now = performance.now();
    if (now < this.wheelLockedUntil) return;
    if (now - this.lastWheelInputAt > 180) this.wheelAccumulator = 0;
    this.lastWheelInputAt = now;
    this.wheelAccumulator += event.deltaY;
    if (Math.abs(this.wheelAccumulator) < 34) return;

    this.browseShelfBy(Math.sign(this.wheelAccumulator));
    this.wheelAccumulator = 0;
    this.wheelLockedUntil = now + 720;
  };

  private handlePointerDown = (event: PointerEvent) => {
    if (this.mode !== "browse") return;
    this.pointerDown = true;
    this.pointerId = event.pointerId;
    this.pointerStartX = event.clientX;
    this.pointerStartY = event.clientY;
    this.pointerLastX = event.clientX;
    this.pointerLastY = event.clientY;
    this.pointerTravel = 0;
    this.dragAxis = null;
    this.canvas.setPointerCapture(event.pointerId);
  };

  private handlePointerMove = (event: PointerEvent) => {
    this.updatePointer(event);
    if (this.mode !== "browse") return;

    if (this.pointerDown && event.pointerId === this.pointerId) {
      this.pendingFocusIndex = null;
      const deltaX = event.clientX - this.pointerLastX;
      const deltaY = event.clientY - this.pointerLastY;
      this.pointerLastX = event.clientX;
      this.pointerLastY = event.clientY;
      this.pointerTravel += Math.hypot(deltaX, deltaY);

      if (this.dragAxis === null && this.pointerTravel > 8) {
        const travelX = Math.abs(event.clientX - this.pointerStartX);
        const travelY = Math.abs(event.clientY - this.pointerStartY);
        this.dragAxis = travelY > travelX ? "vertical" : "horizontal";
      }

      if (this.dragAxis === "horizontal" && this.browseScope === "shelf") {
        const { first, last } = this.rowBoundsForIndex(this.activeIndex);
        this.targetScrollIndex = clamp(
          this.targetScrollIndex -
            deltaX / Math.max(105, this.canvas.clientWidth * 0.11),
          first,
          last,
        );
      }
      this.lastInputTime = performance.now();
      this.canvas.classList.add("is-dragging");
      return;
    }

    this.updateHover();
  };

  private handlePointerUp = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) return;
    const travelX = event.clientX - this.pointerStartX;
    const travelY = event.clientY - this.pointerStartY;
    const wasClick =
      this.pointerTravel < 7 && Math.abs(travelX) < 7 && Math.abs(travelY) < 7;
    const completedVerticalSwipe =
      this.dragAxis === "vertical" && Math.abs(travelY) >= 42;
    this.pointerDown = false;
    this.pointerId = null;
    this.canvas.classList.remove("is-dragging");
    if (this.canvas.hasPointerCapture(event.pointerId)) {
      this.canvas.releasePointerCapture(event.pointerId);
    }
    if (
      this.mode === "browse" &&
      this.browseScope === "shelf" &&
      completedVerticalSwipe
    ) {
      this.browseShelfBy(travelY < 0 ? 1 : -1);
    } else if (this.mode === "browse" && wasClick) {
      this.updatePointer(event);
      if (this.browseScope === "wall" && this.raycastPhoto()) {
        this.callbacks.onPhotoFocus(true);
        this.dragAxis = null;
        return;
      }
      const bookHit = this.raycastBook();
      if (bookHit !== null) {
        if (this.browseScope === "wall") {
          this.browseShelfTo(this.runtimeBooks[bookHit].row);
        } else {
          this.focusBook(bookHit);
        }
      } else if (this.browseScope === "wall") {
        const shelfHit = this.raycastShelf();
        if (shelfHit !== null) this.browseShelfTo(shelfHit);
      }
    }
    this.dragAxis = null;
  };

  private handlePointerCancel = (event: PointerEvent) => {
    if (event.pointerId !== this.pointerId) return;
    this.pointerDown = false;
    this.pointerId = null;
    this.dragAxis = null;
    this.canvas.classList.remove("is-dragging");
  };

  private handlePointerLeave = () => {
    if (!this.pointerDown) {
      this.runtimeBooks.forEach((book) => {
        book.targetHover = 0;
      });
      this.canvas.style.cursor = "grab";
    }
  };

  private handleWindowBlur = () => {
    this.pointerDown = false;
    this.pointerId = null;
    this.dragAxis = null;
    this.canvas.classList.remove("is-dragging");
  };

  private handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      this.returnToShelf();
      return;
    }
    if ((event.key === "r" || event.key === "R") && this.mode === "inspect") {
      this.resetFocusView();
      return;
    }
    if (this.mode !== "browse") return;

    if (this.browseScope === "wall") {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.browseShelfTo(this.runtimeBooks[this.activeIndex]?.row ?? 0);
      }
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      this.browseBy(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      this.browseBy(-1);
    } else if (event.key === "ArrowDown" || event.key === "PageDown") {
      event.preventDefault();
      this.browseShelfBy(1);
    } else if (event.key === "ArrowUp" || event.key === "PageUp") {
      event.preventDefault();
      this.browseShelfBy(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      this.browseTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      this.browseTo(this.runtimeBooks.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      this.focusBook(this.activeIndex);
    }
  };

  private updatePointer(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private raycastBook() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickTargets, false)[0];
    return typeof hit?.object.userData.bookIndex === "number"
      ? (hit.object.userData.bookIndex as number)
      : null;
  }

  private raycastShelf() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(
      this.shelfPickTargets,
      false,
    )[0];
    return typeof hit?.object.userData.shelfRow === "number"
      ? (hit.object.userData.shelfRow as number)
      : null;
  }

  private raycastPhoto() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(this.photoPickTargets, false).length > 0;
  }

  private updateHover() {
    const photoHit = this.browseScope === "wall" && this.raycastPhoto();
    const hit = this.raycastBook();
    this.runtimeBooks.forEach((book) => {
      book.targetHover =
        this.browseScope === "wall"
          ? book.row === (hit === null ? -1 : this.runtimeBooks[hit].row)
            ? 1
            : 0
          : book.index === hit
            ? 1
            : 0;
    });
    const shelfHit =
      this.browseScope === "wall" && hit === null
        ? this.raycastShelf()
        : null;
    this.canvas.style.cursor =
      photoHit || hit !== null || shelfHit !== null
        ? "pointer"
        : this.browseScope === "wall"
          ? "default"
          : "grab";
  }

  private footprintFor(
    book: RuntimeBook,
    pose: BookPose = book.pose,
  ): BookFootprint {
    return {
      id: book.data.id,
      x: book.x + pose.x,
      z: book.slot.position.z + pose.z,
      yaw: pose.yaw,
      scale: pose.scale,
      width: book.width,
      thickness: book.data.thickness,
    };
  }

  private collisionFor(book: RuntimeBook, pose: BookPose) {
    const proposed = this.footprintFor(book, pose);
    return (
      this.runtimeBooks.find(
        (other) =>
          other !== book &&
          other.row === book.row &&
          bookFootprintsOverlap(
            proposed,
            this.footprintFor(other),
            this.motionLayout.collisionMargin,
          ),
      ) ?? null
    );
  }

  private commitBookPose(
    book: RuntimeBook,
    pose: BookPose,
    guardCollision = true,
  ) {
    if (guardCollision) {
      const collidedWith = this.collisionFor(book, pose);
      if (collidedWith) {
        this.collisionRejects += 1;
        this.lastCollisionPair = [book.data.id, collidedWith.data.id];
        return false;
      }
    }

    book.pose = { ...pose };
    book.content.position.x = pose.x;
    book.content.position.z = pose.z;
    book.content.rotation.y = pose.yaw;
    book.content.scale.setScalar(pose.scale);
    return true;
  }

  private ensureInspectionTextures(book: RuntimeBook) {
    if (book.lazyTextures.length > 0) return;
    const titleTexture = toTexture(
      createTitleDecal(book.data),
      this.renderer,
    );
    (book.titleDecal.material as THREE.MeshBasicMaterial).map = titleTexture;
    (book.titleDecal.material as THREE.MeshBasicMaterial).needsUpdate = true;
    book.lazyTextures.push(titleTexture);

    const backTexture = toTexture(
      createBackCover(book.data),
      this.renderer,
    );
    (book.backSurface.material as THREE.MeshStandardMaterial).map = backTexture;
    (book.backSurface.material as THREE.MeshStandardMaterial).needsUpdate = true;
    book.lazyTextures.push(backTexture);
  }

  private beginFocus(index: number) {
    if (
      this.mode !== "browse" ||
      this.browseMotionPhase !== "idle" ||
      this.presentedIndex !== index
    ) {
      return;
    }
    this.ensureInspectionTextures(this.runtimeBooks[index]);
    this.pendingFocusIndex = null;
    this.selectedIndex = index;
    this.focusProgress = 0;
    this.mode = "focusing";
    this.runtimeBooks.forEach((book) => {
      book.targetHover = 0;
    });
    this.callbacks.onMode(this.mode, index);
    this.callbacks.onStatus(
      `Opening ${this.runtimeBooks[index].data.shortTitle}`,
    );
  }

  private updateBrowseMotion(delta: number) {
    if (this.browseMotionPhase === "idle") {
      const requestedIndex = this.pendingFocusIndex;
      if (requestedIndex === null && this.presentedIndex === null) {
        return;
      }
      if (requestedIndex !== null && this.presentedIndex === requestedIndex) {
        this.beginFocus(requestedIndex);
        return;
      }

      this.motionBookIndex = this.presentedIndex ?? requestedIndex;
      this.browseMotionPhase =
        this.presentedIndex === null ? "extract-next" : "retreat-current";
      this.browseMotionProgress = 0;
    }

    const phase = this.browseMotionPhase;
    const motionIndex = this.motionBookIndex;
    if (motionIndex === null) return;
    const duration = this.reducedMotion
      ? Math.max(0.055, browsePhaseDuration[phase] * 0.45)
      : browsePhaseDuration[phase];
    const nextProgress = clamp(
      this.browseMotionProgress + delta / duration,
      0,
      1,
    );
    const movingBook = this.runtimeBooks[motionIndex];
    const proposedPose = browseMotionPose(
      phase,
      nextProgress,
      this.motionLayout,
    );
    if (!this.commitBookPose(movingBook, proposedPose)) return;

    this.browseMotionProgress = nextProgress;
    if (nextProgress < 1) return;

    this.browseMotionProgress = 0;
    switch (phase) {
      case "retreat-current":
        this.browseMotionPhase = "turn-current";
        break;
      case "turn-current":
        this.browseMotionPhase = "shelve-current";
        break;
      case "shelve-current":
        this.presentedIndex = null;
        this.motionBookIndex = this.pendingFocusIndex;
        this.browseMotionPhase =
          this.motionBookIndex === null ? "idle" : "extract-next";
        break;
      case "extract-next":
        this.browseMotionPhase = "turn-next";
        break;
      case "turn-next":
        this.browseMotionPhase = "settle-next";
        break;
      case "settle-next":
        this.presentedIndex = motionIndex;
        this.motionBookIndex = null;
        this.browseMotionPhase = "idle";
        if (this.pendingFocusIndex === this.presentedIndex) {
          this.beginFocus(this.presentedIndex);
        }
        break;
    }
  }

  private animate = () => {
    if (this.isDisposed) return;
    this.animationFrame = requestAnimationFrame(this.animate);
    const timestamp = performance.now();
    const elapsed = timestamp / 1000;
    const delta = clamp((timestamp - this.lastTimestamp) / 1000 || 1 / 60, 0, 0.05);
    this.lastTimestamp = timestamp;

    this.updateState(delta, timestamp);
    this.updateBooks(delta, elapsed);

    if (this.controls.enabled) this.controls.update();
    this.renderer.render(this.scene, this.camera);
    if (timestamp - this.lastDiagnosticsAt > 500) {
      const diagnostics = this.getDiagnostics();
      this.canvas.dataset.drawCalls = String(diagnostics.drawCalls);
      this.canvas.dataset.triangles = String(diagnostics.triangles);
      this.canvas.dataset.geometries = String(diagnostics.geometries);
      this.canvas.dataset.textures = String(diagnostics.textures);
      this.canvas.dataset.stripeAssets = String(
        diagnostics.stripeAssetsLoaded,
      );
      this.canvas.dataset.pixelRatio = String(diagnostics.pixelRatio);
      this.canvas.dataset.motionPhase = diagnostics.motionPhase;
      this.canvas.dataset.collisionFree = String(
        diagnostics.currentCollision === null,
      );
      this.canvas.dataset.collisionRejects = String(
        diagnostics.collisionRejects,
      );
      this.lastDiagnosticsAt = timestamp;
    }
  };

  private updateState(delta: number, timestamp: number) {
    if (this.mode === "browse" || this.mode === "returning") {
      this.updateBrowseFrame(this.activeIndex, delta);
    }
    if (this.mode === "browse") {
      if (!this.pointerDown && timestamp - this.lastInputTime > 150) {
        this.targetScrollIndex = damp(
          this.targetScrollIndex,
          Math.round(this.targetScrollIndex),
          this.reducedMotion ? 18 : 8.5,
          delta,
        );
      }
      this.scrollIndex = damp(
        this.scrollIndex,
        this.targetScrollIndex,
        this.reducedMotion ? 20 : 10,
        delta,
      );
      this.focusProgress = damp(this.focusProgress, 0, 10, delta);
      this.camera.position.lerp(
        this.responsiveBrowseCamera,
        1 - Math.exp(-(this.reducedMotion ? 18 : 7) * delta),
      );
      this.camera.lookAt(this.responsiveBrowseTarget);
    } else if (this.mode === "focusing") {
      this.focusProgress = clamp(
        this.focusProgress +
          delta / (this.reducedMotion ? 0.08 : focusInDuration),
        0,
        1,
      );
      this.updateFocusCamera(delta);
      if (this.focusProgress >= 1) {
        this.mode = "inspect";
        this.controls.enabled = true;
        this.controls.target.copy(this.focusCameraTarget);
        this.callbacks.onMode(this.mode, this.selectedIndex);
        if (this.selectedIndex !== null) {
          this.callbacks.onStatus(
            `Inspecting ${this.runtimeBooks[this.selectedIndex].data.shortTitle}`,
          );
        }
      }
    } else if (this.mode === "returning") {
      this.controls.enabled = false;
      this.focusProgress = clamp(
        this.focusProgress -
          delta / (this.reducedMotion ? 0.08 : focusOutDuration),
        0,
        1,
      );
      this.applyFocusViewOffset(easeOutCubic(this.focusProgress));
      this.camera.position.lerp(
        this.responsiveBrowseCamera,
        1 - Math.exp(-(this.reducedMotion ? 24 : 14) * delta),
      );
      this.camera.lookAt(this.responsiveBrowseTarget);
      if (this.focusProgress <= 0) {
        if (this.selectedIndex !== null) {
          this.commitBookPose(
            this.runtimeBooks[this.selectedIndex],
            presentedBookPose(this.motionLayout),
          );
          this.presentedIndex = this.selectedIndex;
        }
        this.selectedIndex = null;
        this.mode = "browse";
        this.callbacks.onMode(this.mode, null);
        this.callbacks.onStatus(`${this.booksData.length} volumes ready`);
        this.canvas.focus({ preventScroll: true });
      }
    }

    const nextActive = clamp(
      Math.round(this.scrollIndex),
      0,
      this.runtimeBooks.length - 1,
    );
    if (nextActive !== this.activeIndex) {
      this.activeIndex = nextActive;
      this.callbacks.onActiveIndex(this.activeIndex);
    }
    if (this.mode === "browse") {
      this.updateBrowseMotion(delta);
    }
  }

  private updateBooks(delta: number, elapsed: number) {
    const motionFocus =
      this.mode === "returning"
        ? this.focusProgress
        : easeOutCubic(this.focusProgress);
    const isolated = this.selectedIndex !== null && motionFocus > 0.72;
    this.shelfFurniture.visible = !isolated;
    const focusX = window.innerWidth < 760 ? 0 : desktopFocusX;
    const focusZ =
      window.innerWidth < 760 ? mobileFocusZ : desktopFocusZ;
    const focusScale =
      window.innerWidth < 760 ? mobileFocusScale : desktopFocusScale;

    if (this.selectedIndex !== null) {
      const selected = this.runtimeBooks[this.selectedIndex];
      this.commitBookPose(
        selected,
        focusedBookPose(
          motionFocus,
          this.motionLayout,
          focusX,
          focusZ,
          focusScale,
        ),
      );
    }

    this.runtimeBooks.forEach((book) => {
      book.hover = damp(book.hover, book.targetHover, 12, delta);

      const isSelected = book.index === this.selectedIndex;
      const isInCurrentShelf =
        this.browseScope === "wall" || book.row === this.focusedShelfRow;
      book.content.visible = (!isolated && isInCurrentShelf) || isSelected;
      book.slot.rotation.z = damp(
        book.slot.rotation.z,
        isSelected ? 0 : book.shelfTilt,
        9,
        delta,
      );
      book.content.position.y = isSelected ? motionFocus * 0.04 : 0;

      const idleTarget =
        isSelected && this.mode === "inspect" && !this.reducedMotion ? 1 : 0;
      book.idleAmount = damp(book.idleAmount, idleTarget, 5, delta);
      const idleStrength = isSelected ? book.idleAmount : 0;
      const idlePhase = elapsed * 0.78 + book.index * 0.37;
      book.inspectionIdle.position.y =
        Math.sin(idlePhase) * inspectionIdleLift * idleStrength;
      book.inspectionIdle.rotation.set(
        Math.sin(idlePhase * 0.73 + 0.8) *
          inspectionIdlePitch *
          idleStrength,
        Math.sin(idlePhase * 0.61) * inspectionIdleYaw * idleStrength,
        Math.sin(idlePhase * 0.89 + 1.7) *
          inspectionIdleRoll *
          idleStrength,
      );

      if (book.livingMaterial) {
        book.livingMaterial.uniforms.uTime.value = elapsed;
        const livingStrength =
          this.reducedMotion
            ? 0
            : isSelected
              ? 0.24 + motionFocus * 0.55
              : book.index === this.presentedIndex
                ? 0.24 + book.hover * 0.08
                : book.hover * 0.04;
        book.livingMaterial.uniforms.uStrength.value = damp(
          book.livingMaterial.uniforms.uStrength.value,
          livingStrength,
          5,
          delta,
        );
      }
    });
  }

  private updateFocusCamera(delta: number) {
    if (this.selectedIndex === null) return;
    const selected = this.runtimeBooks[this.selectedIndex];
    const worldPosition = new THREE.Vector3();
    selected.content.getWorldPosition(worldPosition);
    this.frameFocusedBook(worldPosition, easeOutCubic(this.focusProgress));
    this.camera.position.lerp(
      this.focusCameraPosition,
      1 - Math.exp(-(this.reducedMotion ? 28 : 13) * delta),
    );
    this.camera.lookAt(this.focusCameraTarget);
  }

  private applyFocusViewOffset(progress: number) {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const isMobile = width < 760;
    const detailWidth =
      width <= 1020
        ? Math.min(compactDetailMaxWidth, width * compactDetailWidthRatio)
        : Math.min(desktopDetailMaxWidth, width * desktopDetailWidthRatio);
    const focusDistance = isMobile ? 5.8 : 5.4;
    const verticalHalfSpan =
      Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * focusDistance;
    const clampedProgress = clamp(progress, 0, 1);
    const horizontalOffset = isMobile
      ? 0
      : detailWidth * 0.5 * clampedProgress;
    const verticalOffset = isMobile
      ? (0.28 / verticalHalfSpan) * height * 0.5 * clampedProgress
      : 0;

    if (clampedProgress <= 0.001) {
      this.camera.clearViewOffset();
      return;
    }

    // Shift the composition through an asymmetric frustum. The camera and
    // OrbitControls can then keep the exact center of the book as their target.
    this.camera.setViewOffset(
      width,
      height,
      horizontalOffset,
      verticalOffset,
      width,
      height,
    );
  }

  private frameFocusedBook(
    worldPosition: THREE.Vector3,
    compositionProgress = 1,
  ) {
    const isMobile = this.canvas.clientWidth < 760;
    const focusDistance = isMobile ? 5.8 : 5.4;
    this.applyFocusViewOffset(compositionProgress);

    this.focusCameraTarget.copy(worldPosition);
    this.focusCameraPosition.set(
      worldPosition.x + (isMobile ? 0 : 0.58),
      worldPosition.y + 0.12,
      worldPosition.z + focusDistance,
    );
  }

  private browseRowCenter(index: number) {
    const book = this.runtimeBooks[index];
    if (!book) return browseTarget.y;
    const shelfSurfaceY = book.slot.position.y - book.data.height * 0.5;
    return shelfSurfaceY + Math.min(1.16, cabinetRowSpacing * 0.46);
  }

  private browseRowCenterX(index: number) {
    const row = this.runtimeBooks[index]?.row ?? 0;
    return this.cabinetLayout?.shelfCenterXs[row] ?? 0;
  }

  private wallCameraDistance() {
    const layout = this.cabinetLayout;
    if (!layout) return 16;
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov * 0.5) * (width / height));
    const distanceForHeight =
      (layout.wallHeight * 0.5 + 0.72) / Math.tan(verticalFov * 0.5);
    const distanceForWidth =
      (layout.wallWidth * 0.5 + 0.72) / Math.tan(horizontalFov * 0.5);
    return Math.max(distanceForHeight, distanceForWidth) + 0.6;
  }

  private updateBrowseFrame(index: number, delta = 0) {
    const isMobile = this.canvas.clientWidth < 760;
    const layout = this.cabinetLayout;
    const isWallView = this.browseScope === "wall";
    const frameCenterX = isWallView
      ? (layout?.wallCenterX ?? 0)
      : this.browseRowCenterX(index);
    const frameCenterY = isWallView
      ? (layout?.wallCenterY ?? browseTarget.y)
      : this.browseRowCenter(index);
    const targetShelfX = browseTarget.x - frameCenterX;
    const targetShelfY = browseTarget.y - frameCenterY;
    const blend = (current: number, target: number) =>
      delta > 0
        ? damp(current, target, this.reducedMotion ? 20 : 6.5, delta)
        : target;

    this.shelfGroup.position.x = blend(
      this.shelfGroup.position.x,
      targetShelfX,
    );
    this.shelfGroup.position.y = blend(
      this.shelfGroup.position.y,
      targetShelfY,
    );
    this.responsiveBrowseCamera.set(
      browseCamera.x,
      browseCamera.y,
      isWallView ? this.wallCameraDistance() : isMobile ? 8.3 : browseCamera.z,
    );
    this.responsiveBrowseTarget.set(
      browseTarget.x,
      browseTarget.y,
      browseTarget.z,
    );
  }

  private handleResize = () => {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const dprCap = width < 760 ? 1.5 : 1.75;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, dprCap));
    this.renderer.setSize(width, height, false);
    this.updateBrowseProjection();
    this.updateBrowseFrame(this.activeIndex);
    if (this.mode === "browse" && this.focusProgress < 0.01) {
      this.camera.clearViewOffset();
      this.camera.position.copy(this.responsiveBrowseCamera);
      this.camera.lookAt(this.responsiveBrowseTarget);
    } else if (this.mode === "inspect" && this.selectedIndex !== null) {
      const worldPosition = new THREE.Vector3();
      this.runtimeBooks[this.selectedIndex].content.getWorldPosition(
        worldPosition,
      );
      this.frameFocusedBook(worldPosition);
    }
  };

  private updateBrowseProjection() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.camera.aspect = width / height;
    this.camera.fov =
      this.browseScope === "wall"
        ? width < 600
          ? 42
          : width < 920
            ? 35
            : 29
        : width < 600
          ? 33
          : width < 920
            ? 30
          : 27;
    this.camera.updateProjectionMatrix();
  }

  private async loadStripeAssets() {
    try {
      this.callbacks.onStatus("Finishing the shelf");
      const [booksResponse, objResponse] = await Promise.all([
        fetch(`${STRIPE_ASSET_ROOT}/books.json`),
        fetch(`${STRIPE_ASSET_ROOT}/mesh/stripe-press-book.obj`),
      ]);
      if (!booksResponse.ok || !objResponse.ok) {
        throw new Error("Stripe Press asset archive unavailable");
      }
      const bookAssets = (await booksResponse.json()) as StripeBookAsset[];
      const parsed = new OBJLoader().parse(await objResponse.text());
      const sourceMesh = parsed.children.find(
        (child): child is THREE.Mesh => child instanceof THREE.Mesh,
      );
      if (!sourceMesh) throw new Error("Shared book mesh unavailable");

      // Normalize the imported asset once. Every edition then shares a centered
      // canonical mesh while presentation rotation remains on its wrapper.
      const geometry = sourceMesh.geometry.clone();
      geometry.computeBoundingBox();
      if (!geometry.boundingBox) throw new Error("Shared book bounds unavailable");
      geometry.boundingBox.getSize(this.stripeGeometrySize);
      if (
        this.stripeGeometrySize.x <= 0 ||
        this.stripeGeometrySize.y <= 0 ||
        this.stripeGeometrySize.z <= 0
      ) {
        throw new Error("Shared book bounds are invalid");
      }
      const geometryCenter = geometry.boundingBox.getCenter(new THREE.Vector3());
      geometry.translate(
        -geometryCenter.x,
        -geometryCenter.y,
        -geometryCenter.z,
      );
      geometry.computeBoundingBox();
      this.stripeGeometry = geometry;
      await Promise.allSettled(
        bookAssets.map((bookAsset) => this.loadStripeBook(bookAsset)),
      );
      this.callbacks.onStatus(`${this.booksData.length} volumes ready`);
    } catch {
      this.callbacks.onStatus(`${this.booksData.length} volumes ready`);
    }
  }

  private textureFor(
    reference: { local_file: string | null } | undefined,
    color = false,
  ) {
    if (!reference?.local_file) {
      return Promise.resolve<THREE.Texture | null>(null);
    }
    const key = reference.local_file;
    const cached = this.stripeTextureCache.get(key);
    if (cached) return cached;

    const promise = new THREE.TextureLoader()
      .loadAsync(stripeAssetUrl(key))
      .then((texture) => {
        texture.name = key;
        texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.anisotropy = Math.min(
          8,
          this.renderer.capabilities.getMaxAnisotropy(),
        );
        this.stripeTextures.add(texture);
        return texture;
      })
      .catch(() => null);
    this.stripeTextureCache.set(key, promise);
    return promise;
  }

  private async loadCustomCover(runtime: RuntimeBook, coverImage: string) {
    try {
      const texture = await new THREE.TextureLoader().loadAsync(coverImage);
      if (this.isDisposed) {
        texture.dispose();
        return;
      }

      texture.name = `customCover:${runtime.data.id}`;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(
        16,
        this.renderer.capabilities.getMaxAnisotropy(),
      );

      const material = runtime.frontSurface.material;
      const proceduralTexture = material.map;
      material.map = texture;
      material.needsUpdate = true;
      runtime.textures.push(texture);

      if (proceduralTexture) {
        const index = runtime.textures.indexOf(proceduralTexture);
        if (index >= 0) runtime.textures.splice(index, 1);
        proceduralTexture.dispose();
      }
    } catch {
      // Keep the generated procedural cover when an optional image is missing
      // or blocked by cross-origin policy.
    }
  }

  private async loadStripeBook(bookAsset: StripeBookAsset) {
    const runtime = this.runtimeBooks.find(
      (book) => book.data.id === bookAsset.slug,
    );
    if (!runtime || !this.stripeGeometry) return;

    try {
      const [diffuse, bump, foil] = await Promise.all([
        this.textureFor(bookAsset.textures.diffuseMapCustom, true),
        this.textureFor(
          bookAsset.textures.bumpMapCustom ?? bookAsset.textures.bumpMapBase,
        ),
        this.textureFor(bookAsset.textures.foilMap),
      ]);
      if (!diffuse || this.isDisposed) {
        throw new Error(`Missing cover texture for ${bookAsset.slug}`);
      }

      const foilSettings = stripeFoilSettings(bookAsset.material);
      const material = new THREE.MeshPhysicalMaterial({
        name: `stripePressMaterial:${bookAsset.slug}`,
        map: diffuse,
        bumpMap: bump,
        bumpScale: Number(bookAsset.material.bumpScaleCustom ?? 0.035),
        metalnessMap: foil,
        metalness: foil ? 0.22 : 0.04,
        roughness: 0.68,
        clearcoat: 0.12,
        clearcoatRoughness: 0.55,
      });
      if (foil && foilSettings.enabled) {
        material.onBeforeCompile = (shader) => {
          shader.uniforms.stripeFoilMap = { value: foil };
          shader.uniforms.stripeFoilOpacity = {
            value: foilSettings.opacity,
          };
          shader.uniforms.stripeFoilDetail = {
            value: foilSettings.detail,
          };
          shader.fragmentShader = addStripeFoilBlend(
            shader.fragmentShader,
          );
        };
        material.customProgramCacheKey = () => "stripe-colored-foil-v1";
        material.userData.stripeFoil = {
          opacity: foilSettings.opacity,
          detail: foilSettings.detail,
        };
      }
      const mesh = new THREE.Mesh(this.stripeGeometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const root = new THREE.Group();
      root.name = `stripePressEdition:${bookAsset.slug}`;
      root.add(mesh);
      root.rotation.y = stripeBookCoverFacingRotationY;

      const targetWidth = 1.31 + ((runtime.index % 5) - 2) * 0.018;
      root.scale.set(
        runtime.data.thickness / this.stripeGeometrySize.x,
        runtime.data.height / this.stripeGeometrySize.y,
        targetWidth / this.stripeGeometrySize.z,
      );
      root.updateMatrixWorld(true);
      root.userData.displaySize = {
        width: targetWidth,
        height: runtime.data.height,
        thickness: runtime.data.thickness,
      };
      root.userData.coverFacing = "+Z";

      runtime.assetHolder.add(root);
      runtime.physical.visible = false;
      runtime.titleDecal.visible = false;
      runtime.textures.forEach((texture) => texture.dispose());
      runtime.textures.length = 0;
      this.assetCount += 1;
    } catch {
      this.assetFailures += 1;
    }
  }

  private rowBoundsForIndex(index: number) {
    const current = this.runtimeBooks[
      clamp(Math.round(index), 0, this.runtimeBooks.length - 1)
    ];
    if (!current) return { first: 0, last: 0 };
    const rowBooks = this.runtimeBooks.filter((book) => book.row === current.row);
    return {
      first: rowBooks[0]?.index ?? current.index,
      last: rowBooks[rowBooks.length - 1]?.index ?? current.index,
    };
  }

  private setShelfPageIndex(index: number) {
    const next = clamp(Math.round(index), 0, this.runtimeBooks.length - 1);
    this.pendingFocusIndex = null;
    this.scrollIndex = next;
    this.targetScrollIndex = next;
    this.lastInputTime = performance.now();
    if (next !== this.activeIndex) {
      this.activeIndex = next;
      this.callbacks.onActiveIndex(next);
    }
  }

  private setBrowseScope(scope: BrowseScope, row: number | null) {
    this.focusedShelfRow = scope === "shelf" ? row : null;
    this.wallCabinet.visible = scope === "wall";
    this.focusShelfBoards.forEach((shelf, shelfRow) => {
      shelf.visible = scope === "shelf" && shelfRow === row;
    });
    if (this.browseScope === scope) {
      this.callbacks.onBrowseScope(scope, row);
      return;
    }
    this.browseScope = scope;
    this.camera.clearViewOffset();
    this.callbacks.onBrowseScope(scope, row);
    this.updateBrowseProjection();
  }

  showWall() {
    if (this.mode !== "browse") return;
    this.pendingFocusIndex = null;
    this.presentedIndex = null;
    this.motionBookIndex = null;
    this.browseMotionPhase = "idle";
    this.browseMotionProgress = 0;
    this.runtimeBooks.forEach((book) => {
      this.commitBookPose(book, shelvedBookPose(this.motionLayout), false);
      book.targetHover = 0;
    });
    this.setBrowseScope("wall", null);
    this.callbacks.onStatus("Viewing the complete wall");
  }

  browseShelfBy(direction: number) {
    if (
      this.mode !== "browse" ||
      this.browseScope !== "shelf" ||
      direction === 0
    ) {
      return;
    }
    const currentIndex = clamp(
      Math.round(this.targetScrollIndex),
      0,
      this.runtimeBooks.length - 1,
    );
    const targetIndex = adjacentShelfBookIndex(
      this.runtimeBooks,
      currentIndex,
      direction,
    );
    if (targetIndex !== currentIndex) this.setShelfPageIndex(targetIndex);
  }

  browseShelfTo(row: number) {
    if (this.mode !== "browse") return;
    const targetIndex = centeredShelfBookIndex(this.runtimeBooks, Math.round(row));
    if (this.runtimeBooks[targetIndex]?.row === Math.round(row)) {
      this.setShelfPageIndex(targetIndex);
      this.setBrowseScope("shelf", Math.round(row));
      this.callbacks.onStatus(
        `Viewing ${this.runtimeBooks[targetIndex].data.shelfGroupName ?? "shelf"}`,
      );
    }
  }

  browseBy(direction: number) {
    if (this.mode !== "browse") return;
    const current = Math.round(this.targetScrollIndex);
    const { first, last } = this.rowBoundsForIndex(current);
    this.browseTo(clamp(current + direction, first, last));
  }

  browseTo(index: number) {
    if (this.mode !== "browse") return;
    const next = clamp(Math.round(index), 0, this.runtimeBooks.length - 1);
    if (this.browseScope === "wall") {
      this.browseShelfTo(this.runtimeBooks[next].row);
      this.targetScrollIndex = next;
      return;
    }
    const current = this.runtimeBooks[
      clamp(Math.round(this.targetScrollIndex), 0, this.runtimeBooks.length - 1)
    ];
    if (current && this.runtimeBooks[next]?.row !== current.row) {
      this.setShelfPageIndex(next);
      return;
    }
    this.pendingFocusIndex = null;
    this.targetScrollIndex = next;
    this.lastInputTime = performance.now() - 1000;
  }

  focusBook(index = this.activeIndex) {
    if (this.mode !== "browse") return;
    const next = clamp(Math.round(index), 0, this.runtimeBooks.length - 1);
    if (this.browseScope === "wall") {
      this.browseShelfTo(this.runtimeBooks[next].row);
      return;
    }
    this.targetScrollIndex = next;
    this.scrollIndex = next;
    this.activeIndex = next;
    this.pendingFocusIndex = next;
    this.callbacks.onActiveIndex(next);
    this.callbacks.onStatus(
      `Preparing ${this.runtimeBooks[next].data.shortTitle}`,
    );
    if (
      this.browseMotionPhase === "idle" &&
      this.presentedIndex === next
    ) {
      this.beginFocus(next);
    }
  }

  returnToShelf() {
    if (this.mode === "browse" && this.pendingFocusIndex !== null) {
      this.pendingFocusIndex = null;
      this.callbacks.onStatus("Opening cancelled");
      return;
    }
    if (this.mode === "browse") {
      if (this.browseScope === "shelf") this.showWall();
      return;
    }
    if (this.mode === "returning") return;
    this.controls.enabled = false;
    this.mode = "returning";
    this.callbacks.onMode(this.mode, this.selectedIndex);
    this.callbacks.onStatus("Returning to the complete shelf");
  }

  resetFocusView() {
    if (this.mode !== "inspect" || this.selectedIndex === null) return;
    const selected = this.runtimeBooks[this.selectedIndex];
    const worldPosition = new THREE.Vector3();
    selected.content.getWorldPosition(worldPosition);
    this.frameFocusedBook(worldPosition);
    this.controls.target.copy(this.focusCameraTarget);
    this.camera.position.copy(this.focusCameraPosition);
    this.controls.update();
  }

  private findAnyCollision(): [string, string] | null {
    for (let leftIndex = 0; leftIndex < this.runtimeBooks.length; leftIndex += 1) {
      const left = this.runtimeBooks[leftIndex];
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < this.runtimeBooks.length;
        rightIndex += 1
      ) {
        const right = this.runtimeBooks[rightIndex];
        if (left.row !== right.row) continue;
        if (
          bookFootprintsOverlap(
            this.footprintFor(left),
            this.footprintFor(right),
            this.motionLayout.collisionMargin,
          )
        ) {
          return [left.data.id, right.data.id];
        }
      }
    }
    return null;
  }

  getDiagnostics() {
    const info = this.renderer.info;
    return {
      mode: this.mode,
      browseScope: this.browseScope,
      activeIndex: this.activeIndex,
      selectedIndex: this.selectedIndex,
      books: this.runtimeBooks.length,
      stripeAssetsLoaded: this.assetCount,
      stripeAssetFailures: this.assetFailures,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      pixelRatio: this.renderer.getPixelRatio(),
      motionPhase: this.browseMotionPhase,
      collisionRejects: this.collisionRejects,
      lastCollisionPair: this.lastCollisionPair,
      currentCollision: this.findAnyCollision(),
      wallColumns: this.cabinetLayout?.wallColumnCount ?? 1,
      canvas: {
        width: this.canvas.width,
        height: this.canvas.height,
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
      },
    };
  }

  dispose() {
    this.isDisposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("blur", this.handleWindowBlur);

    this.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry?.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      materials.forEach((material) => material?.dispose());
    });
    this.runtimeBooks.forEach((book) => {
      book.textures.forEach((texture) => texture.dispose());
      book.lazyTextures.forEach((texture) => texture.dispose());
    });
    this.shelfTextures.forEach((texture) => texture.dispose());
    this.stripeTextures.forEach((texture) => texture.dispose());
    this.stripeTextureCache.clear();
    this.stripeTextures.clear();
    this.stripeGeometry = null;
    this.stripeGeometrySize.set(0, 0, 0);
    this.renderer.dispose();
    delete (
      window as unknown as {
        __PRESS_LIBRARY__?: unknown;
      }
    ).__PRESS_LIBRARY__;
  }
}
