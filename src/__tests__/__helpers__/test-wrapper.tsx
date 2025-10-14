import type React from "react";
import { ThemeProvider } from "../../components/theme-provider";

/**
 * Wrapper component for tests that need theme context
 */
export function TestWrapper({ children }: { children: React.ReactNode }) {
	return (
		<ThemeProvider
			attribute="class"
			defaultTheme="light"
			disableTransitionOnChange
			enableSystem={false}
		>
			{children}
		</ThemeProvider>
	);
}
