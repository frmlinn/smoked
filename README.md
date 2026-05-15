# Smoked 💨

Real-time 2D fluid simulation engine implemented in **WebGL2**. The solver follows an **Eulerian grid-based approach** to solve the incompressible Navier-Stokes equations for fluid flow. 

The system leverages GPGPU (General-Purpose computing on Graphics Processing Units) by executing all physical calculations within fragment shaders. State persistence and iterative computation are handled via Framebuffer Objects (FBOs) using a "Ping-Pong" texture swapping technique.

---

## Physics and Mathematical Formulation

The simulation is governed by the **Incompressible Navier-Stokes Equations**, which describe the evolution of a velocity field $\mathbf{u}$ and a scalar pressure field $p$ over time:

1. **Momentum Equation:**
   $$\frac{\partial \mathbf{u}}{\partial t} + (\mathbf{u} \cdot \nabla)\mathbf{u} = -\frac{1}{\rho}\nabla p + \nu \nabla^2 \mathbf{u} + \mathbf{f}$$

2. **Incompressibility Constraint:**
   $$\nabla \cdot \mathbf{u} = 0$$

Where:
- $\mathbf{u}$: Velocity vector field.
- $p$: Scalar pressure field.
- $\rho$: Fluid density.
- $\nu$: Kinematic viscosity (ignored in this specific solver for inviscid behavior).
- $\mathbf{f}$: External forces (buoyancy, user interaction).

### Numerical Solution Pipeline

We employ a fractional step method (operator splitting) to solve these equations through a series of discrete GPGPU passes:

#### 1. Advection (Semi-Lagrangian Scheme)
The advection term $(\mathbf{u} \cdot \nabla)\mathbf{u}$ describes how quantities are transported by the velocity field. We use a **Semi-Lagrangian** approach (`advection.frag`):
$$\phi(\mathbf{x}, t + \Delta t) = \phi(\mathbf{x} - \mathbf{u}(\mathbf{x}, t)\Delta t, t)$$
For each cell, we trace back its position in time to find the previous value and use bilinear interpolation to sample the texture.

#### 2. External Forces and Buoyancy
External forces $\mathbf{f}$ are applied to the velocity field. In smoke simulation, buoyancy is modeled based on temperature $T$ and smoke density $d$ (`physicsForces.frag`):
$$\mathbf{f}_{buoy} = (-\alpha d + \beta(T - T_{amb}))\mathbf{j}$$
Where $\alpha$ and $\beta$ are coefficients for weight and lift, respectively.

#### 3. Divergence Computation
To satisfy the incompressibility constraint, we first calculate the divergence of the intermediate velocity field $\mathbf{u}^*$ (`divergence.frag`):
$$\nabla \cdot \mathbf{u} \approx \frac{u_{i+1, j} - u_{i-1, j}}{2\Delta x} + \frac{v_{i, j+1} - v_{i, j-1}}{2\Delta y}$$

#### 4. Pressure Projection (Poisson Equation)
The pressure required to counteract the divergence is found by solving the **Poisson Equation**:
$$\nabla^2 p = \frac{\rho}{\Delta t} \nabla \cdot \mathbf{u}^*$$
In this engine, we approximate the solution using the **Jacobi Relaxation** method (`pressure.frag`), an iterative algorithm that updates pressure based on its neighbors:
$$p_{i,j}^{k+1} = \frac{p_{i-1,j}^k + p_{i+1,j}^k + p_{i,j-1}^k + p_{i,j+1}^k - (\nabla \cdot \mathbf{u}^*) \Delta x^2}{4}$$
We typically perform 20 to 50 iterations per frame to reach convergence.

#### 5. Gradient Subtraction
The final velocity field is obtained by subtracting the pressure gradient from the intermediate velocity (`gradientSubtract.frag`):
$$\mathbf{u}^{n+1} = \mathbf{u}^* - \frac{\Delta t}{\rho} \nabla p$$

---

## Technical Implementation

- **Floating Point Textures:** The simulation uses `HALF_FLOAT` or `FLOAT` textures to store high-dynamic-range physical data, preventing clamping or precision loss during iterative passes.
- **Ping-Pong Rendering:** Implemented via the `DoubleFBO` class, allowing the GPU to read from a previous state while writing to the current one simultaneously.
- **Post-Processing:** Includes Bloom, Sunrays (God Rays), and Gaussian Blur passes to enhance the visualization of the dye density.

---

> **NOTE:** **Feature in Development (Obstacles)**
> There is a secondary active branch focusing on the implementation of static obstacles. This involves enforcing **Neumann Boundary Conditions** ($\frac{\partial p}{\partial \mathbf{n}} = 0$) during the pressure solve pass to ensure fluid velocity is zero at solid interfaces and flows around boundaries correctly.

---

## Local Development

Ensure you have [Node.js](https://nodejs.org/) installed. This project uses [Vite](https://vitejs.dev/) for bundling and development.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/frmlinn/smoked.git
   cd smoked
   ```
2. **Install dependencies:**
    ```bash
    npm install
    ```
3. **Run development server:**
    ```bash
    npm run dev
    ```

## Acknowledgments and References
This project was built upon the mathematical foundations and algorithms detailed in the **SIGGRAPH 2007 Course Notes on Fluid Simulation**, developed for academic use within my applied physics seminars for my students. 

Special thanks to **Matthias Müller-Fischer** and **Robert Bridson**. Their seminal work in physics-based animation and their clear exposition of the Eulerian fluid solver provided the essential blueprint for the mathematical architecture of this engine.