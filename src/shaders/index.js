import baseVert from './base.vert?raw';
import blurVert from './blur.vert?raw';
import blurFrag from './blur.frag?raw';
import copyFrag from './copy.frag?raw';
import clearFrag from './clear.frag?raw';
import colorFrag from './color.frag?raw';
import bloomPrefilterFrag from './bloomPrefilter.frag?raw';
import bloomBlurFrag from './bloomBlur.frag?raw';
import bloomFinalFrag from './bloomFinal.frag?raw';
import sunraysMaskFrag from './sunraysMask.frag?raw';
import sunraysFrag from './sunrays.frag?raw';
import splatFrag from './splat.frag?raw';
import advectionFrag from './advection.frag?raw';
import divergenceFrag from './divergence.frag?raw';
import curlFrag from './curl.frag?raw';
import vorticityFrag from './vorticity.frag?raw';
import pressureFrag from './pressure.frag?raw';
import gradientSubtractFrag from './gradientSubtract.frag?raw';
import buoyancyFrag from './buoyancy.frag?raw';
import vectorVert from './vector.vert?raw';
import vectorFrag from './vector.frag?raw';
import displayColorFrag from './displayColor.frag?raw';
import displayPressureFrag from './displayPressure.frag?raw';
import displayTemperatureFrag from './displayTemperature.frag?raw';

export const shaders = {
    baseVert, blurVert, blurFrag, copyFrag, clearFrag, colorFrag,
    bloomPrefilterFrag, bloomBlurFrag, bloomFinalFrag,
    sunraysMaskFrag, sunraysFrag, splatFrag, advectionFrag,
    divergenceFrag, curlFrag, vorticityFrag, pressureFrag,
    gradientSubtractFrag, buoyancyFrag, vectorVert, vectorFrag,
    displayColorFrag, displayPressureFrag, displayTemperatureFrag
};