/** Portions derived from OgarX by Yuu6883, MIT License. See NOTICE-OGARX.txt. */
import {makeVirus as kernelMakeVirus,stepViruses as kernelStepViruses,virusRadius as kernelVirusRadius,virusCharge as kernelVirusCharge,PHYSICS_CONFIG} from './physics.js?v=senpa-oct27-2';
export const VIRUS_BASE_MASS=PHYSICS_CONFIG.virusSize**2/100;
export const VIRUS_CHARGE_MASS=PHYSICS_CONFIG.ejectSize**2/100*PHYSICS_CONFIG.virusFeedTimes;
export const VIRUS_MIN_COUNT=PHYSICS_CONFIG.virusCount;
export const VIRUS_MAX_COUNT=PHYSICS_CONFIG.maxWorldCells;
export const makeVirus=kernelMakeVirus;
export const stepViruses=kernelStepViruses;
export const virusRadius=kernelVirusRadius;
export const virusCharge=kernelVirusCharge;
