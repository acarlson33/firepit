/**
 * Preset gradients for profile backgrounds
 */

export type PresetGradient = {
    id: string;
    name: string;
    cssValue: string;
    colors: readonly string[];
};

export const PRESET_GRADIENTS = [
    {
        id: "blessed-calm",
        name: "Blessed Calm",
        cssValue: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        colors: ["#667eea", "#764ba2"],
    },
    {
        id: "sunrise",
        name: "Sunrise",
        cssValue: "linear-gradient(135deg, #ff6b6b 0%, #feca57 100%)",
        colors: ["#ff6b6b", "#feca57"],
    },
    {
        id: "deep-space",
        name: "Deep Space",
        cssValue:
            "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
        colors: ["#0f0c29", "#302b63", "#24243e"],
    },
    {
        id: "coral-dream",
        name: "Coral Dream",
        cssValue: "linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)",
        colors: ["#ff9a9e", "#fecfef"],
    },
    {
        id: "forest-mist",
        name: "Forest Mist",
        cssValue: "linear-gradient(135deg, #66785f 0%, #91ac8f 100%)",
        colors: ["#66785f", "#91ac8f"],
    },
    {
        id: "midnight-city",
        name: "Midnight City",
        cssValue: "linear-gradient(135deg, #232526 0%, #414345 100%)",
        colors: ["#232526", "#414345"],
    },
    {
        id: "royal-passion",
        name: "Royal Passion",
        cssValue: "linear-gradient(135deg, #c31432 0%, #240b36 100%)",
        colors: ["#c31432", "#240b36"],
    },
    {
        id: "ocean-haze",
        name: "Ocean Haze",
        cssValue: "linear-gradient(135deg, #2c3e50 0%, #4ca1af 100%)",
        colors: ["#2c3e50", "#4ca1af"],
    },
    {
        id: "firewatch",
        name: "Firewatch",
        cssValue: "linear-gradient(135deg, #c94b4b 0%, #4b134f 100%)",
        colors: ["#c94b4b", "#4b134f"],
    },
    {
        id: "cosmic-fusion",
        name: "Cosmic Fusion",
        cssValue: "linear-gradient(135deg, #ff00cc 0%, #333399 100%)",
        colors: ["#ff00cc", "#333399"],
    },
    {
        id: "frost",
        name: "Frost",
        cssValue: "linear-gradient(135deg, #c9d6ff 0%, #e2e2e2 100%)",
        colors: ["#c9d6ff", "#e2e2e2"],
    },
    {
        id: "moss",
        name: "Moss",
        cssValue: "linear-gradient(135deg, #134e5e 0%, #71b280 100%)",
        colors: ["#134e5e", "#71b280"],
    },
] as const satisfies readonly PresetGradient[];

export const PRESET_COLORS = [
    "#1a1a2e",
    "#16213e",
    "#0f3460",
    "#533483",
    "#e94560",
    "#2d3436",
    "#636e72",
    "#d63031",
    "#e17055",
    "#fdcb6e",
    "#00b894",
    "#0984e3",
    "#6c5ce7",
    "#a29bfe",
    "#fd79a8",
    "#81ecec",
] as const;

export function getPresetGradientById(id: string): PresetGradient | undefined {
    return PRESET_GRADIENTS.find((g) => g.id === id);
}

export function isValidPresetGradientId(id: string): boolean {
    return PRESET_GRADIENTS.some((g) => g.id === id);
}
