import { defineFrameulatorElement } from "@luminarylabs/frameulator";
import "./site.css";

// The workbench starts without an application. Its explicit sample loader uses
// a bundled neutral adapter; there is no release registry or network gate.
defineFrameulatorElement();
