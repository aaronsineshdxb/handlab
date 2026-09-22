import type { Metadata } from "next";
import HandLabVR from "../../components/HandLabVR";

export const metadata: Metadata = {
  title: "HANDLAB VR — WebXR hand + controller building",
  description:
    "Isolated VR route: enter immersive-vr on Quest, place and grab shapes with controllers or hand pinch. Scenes shared with the desktop lab.",
};

export default function VRPage() {
  return <HandLabVR />;
}
