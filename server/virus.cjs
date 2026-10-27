'use strict';
/** Portions derived from OgarX by Yuu6883, MIT License. See NOTICE-OGARX.txt. */
const {makeVirus:kernelMakeVirus,stepViruses:kernelStepViruses,virusRadius:kernelVirusRadius,virusCharge:kernelVirusCharge,PHYSICS_CONFIG}=require('./physics.cjs');
const VIRUS_BASE_MASS=PHYSICS_CONFIG.virusSize**2/100;
const VIRUS_CHARGE_MASS=PHYSICS_CONFIG.ejectSize**2/100*PHYSICS_CONFIG.virusFeedTimes;
const VIRUS_MIN_COUNT=PHYSICS_CONFIG.virusCount;
const VIRUS_MAX_COUNT=PHYSICS_CONFIG.maxWorldCells;
const makeVirus=kernelMakeVirus;
const stepViruses=kernelStepViruses;
const virusRadius=kernelVirusRadius;
const virusCharge=kernelVirusCharge;

module.exports={VIRUS_BASE_MASS,VIRUS_CHARGE_MASS,VIRUS_MIN_COUNT,VIRUS_MAX_COUNT,makeVirus,stepViruses,virusRadius,virusCharge};
