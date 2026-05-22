import { TabPlaceholderScreen } from "@/components/tab-placeholder-screen";

export default function HomeTabScreen() {
    return (
        <TabPlaceholderScreen
            eyebrow="Firepit home"
            title="Home"
            description="This is where the main workspace overview will live."
            badgeLabel="Ready"
            badgeTone="success"
        />
    );
}
