import { useCallback, useRef, useState } from "react";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    useWindowDimensions,
    View,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

const SLIDES = [
    {
        title: "Welcome to Firepit",
        subtitle: "A messaging platform for your community.",
        body: "Browse servers, join channels, and chat with your people — all from your own instance.",
    },
    {
        title: "Servers & channels",
        subtitle: "Organised spaces for every topic.",
        body: "The Home tab shows your servers. Tap one to browse its channels — each channel is a dedicated chat room.",
    },
    {
        title: "Messages & media",
        subtitle: "Share more than text.",
        body: "Send messages, reply in threads, share images and files, and use GIFs and stickers in any conversation.",
    },
    {
        title: "Stay in the loop",
        subtitle: "Inbox, friends & settings.",
        body: "Use the Inbox tab for direct messages and notifications. Customise your experience in Settings.",
    },
];

type Props = {
    onComplete: () => void;
};

export function OnboardingOverlay({ onComplete }: Props) {
    const theme = useTheme();
    const { width: screenWidth } = useWindowDimensions();
    const scrollRef = useRef<ScrollView>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const isLastSlide = currentIndex === SLIDES.length - 1;

    const handleScroll = useCallback(
        (e: { nativeEvent: { contentOffset: { x: number } } }) => {
            const index = Math.round(
                e.nativeEvent.contentOffset.x / screenWidth,
            );
            setCurrentIndex(index);
        },
        [screenWidth],
    );

    const handleNext = useCallback(() => {
        if (isLastSlide) {
            onComplete();
        } else {
            scrollRef.current?.scrollTo({
                x: (currentIndex + 1) * screenWidth,
                animated: true,
            });
        }
    }, [isLastSlide, currentIndex, screenWidth, onComplete]);

    return (
        <View
            style={[
                styles.root,
                { backgroundColor: theme.background },
            ]}
        >
            {/* Skip button */}
            {!isLastSlide ? (
                <Pressable
                    accessibilityRole="button"
                    onPress={onComplete}
                    style={styles.skip}
                >
                    <ThemedText
                        type="smallBold"
                        themeColor="mutedForeground"
                    >
                        Skip
                    </ThemedText>
                </Pressable>
            ) : null}

            {/* Slides */}
            <ScrollView
                ref={scrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleScroll}
                scrollEventThrottle={16}
                bounces={false}
            >
                {SLIDES.map((slide, index) => (
                    <View
                        key={index}
                        style={[styles.slide, { width: screenWidth }]}
                    >
                        <ThemedView
                            type="card"
                            style={[
                                styles.card,
                                { borderColor: theme.border },
                            ]}
                        >
                            {/* Number indicator */}
                            <ThemedView
                                type="muted"
                                style={styles.stepBadge}
                            >
                                <ThemedText
                                    type="code"
                                    themeColor="mutedForeground"
                                >
                                    {index + 1} / {SLIDES.length}
                                </ThemedText>
                            </ThemedView>

                            <ThemedText
                                type="title"
                                style={styles.slideTitle}
                            >
                                {slide.title}
                            </ThemedText>

                            <ThemedText
                                type="subtitle"
                                style={styles.slideSubtitle}
                            >
                                {slide.subtitle}
                            </ThemedText>

                            <ThemedText
                                themeColor="mutedForeground"
                                style={styles.slideBody}
                            >
                                {slide.body}
                            </ThemedText>
                        </ThemedView>
                    </View>
                ))}
            </ScrollView>

            {/* Bottom controls */}
            <View
                style={[
                    styles.bottom,
                    { backgroundColor: theme.background },
                ]}
            >
                {/* Dot indicators */}
                <View style={styles.dots}>
                    {SLIDES.map((_, index) => (
                        <View
                            key={index}
                            style={[
                                styles.dot,
                                {
                                    backgroundColor:
                                        index === currentIndex
                                            ? theme.primary
                                            : theme.mutedForeground,
                                    opacity:
                                        index === currentIndex ? 1 : 0.3,
                                },
                            ]}
                        />
                    ))}
                </View>

                {/* Next / Get Started button */}
                <Pressable
                    accessibilityRole="button"
                    onPress={handleNext}
                    style={({ pressed }) => [
                        styles.nextButton,
                        {
                            backgroundColor: theme.primary,
                            borderColor: theme.primary,
                        },
                        pressed && styles.nextButtonPressed,
                    ]}
                >
                    <ThemedText
                        type="smallBold"
                        themeColor="primaryForeground"
                        style={styles.nextButtonLabel}
                    >
                        {isLastSlide ? "Get started" : "Next"}
                    </ThemedText>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
    },
    skip: {
        position: "absolute",
        top: 60,
        right: Spacing.three,
        zIndex: 10,
        paddingHorizontal: Spacing.three,
        paddingVertical: Spacing.two,
    },
    slide: {
        flex: 1,
        justifyContent: "center",
        paddingHorizontal: Spacing.three,
    },
    card: {
        borderRadius: 28,
        padding: Spacing.five,
        gap: Spacing.three,
        borderWidth: 1,
    },
    stepBadge: {
        alignSelf: "flex-start",
        paddingHorizontal: Spacing.two,
        paddingVertical: Spacing.one,
        borderRadius: 999,
    },
    slideTitle: {},
    slideSubtitle: {},
    slideBody: {
        fontSize: 16,
        lineHeight: 24,
    },
    bottom: {
        paddingHorizontal: Spacing.three,
        paddingBottom: 60,
        gap: Spacing.four,
        alignItems: "center",
    },
    dots: {
        flexDirection: "row",
        gap: Spacing.two,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    nextButton: {
        alignSelf: "stretch",
        minHeight: 52,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: Spacing.four,
        borderWidth: 1,
        shadowColor: "#d9792b",
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
    },
    nextButtonPressed: {
        opacity: 0.85,
    },
    nextButtonLabel: {
        fontSize: 17,
    },
});
