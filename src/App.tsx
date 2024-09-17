import { Authenticator } from "@aws-amplify/ui-react";
import "@aws-amplify/ui-react/styles.css";
import { LogOut, RotateCcw, Settings as SettingsIcon } from "lucide-react";
import { useState } from "react";
import { Chat } from "./components/Chat";
import { Settings } from "./components/Settings";
import { Button } from "./components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "./components/ui/drawer";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./components/ui/tooltip";

export type Framework = "ai" | "langchain";

export type Model = "claude-3-5-sonnet" | "claude-3-sonnet" | "claude-3-haiku";

export type Settings = {
  framework: Framework;
  model: Model;
  temperature: number;
  system: string;
};

const defaultSettings: Settings = {
  framework: "ai",
  model: "claude-3-5-sonnet",
  temperature: 0.5,
  system: "You are a helpful, respectful and honest assistant.",
};

export function App() {
  const [settings, setSettings] = useState(defaultSettings);

  const handleSettings = (settings: Settings) => setSettings(settings);

  return (
    <div className="w-full min-h-screen flex justify-center">
      <Authenticator>
        {({ signOut }) => (
          <div className="grid h-screen w-full pl-[56px]">
            <aside className="inset-y fixed left-0 z-20 flex h-full flex-col border-r">
              <div className="border-b p-2">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Reset"
                  asChild
                >
                  <a href="/" title="Reset">
                    <RotateCcw className="size-5" />
                  </a>
                </Button>
              </div>
              <nav className="mt-auto grid gap-1 p-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mt-auto rounded-lg"
                      aria-label="Sign out"
                      onClick={() => {
                        if (signOut) {
                          signOut();
                        }
                      }}
                    >
                      <LogOut className="size-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={5}>
                    Sign out
                  </TooltipContent>
                </Tooltip>
              </nav>
            </aside>
            <div className="flex flex-col">
              <header className="sticky top-0 z-10 flex h-[57px] items-center gap-1 border-b bg-background px-4">
                <h1 className="text-xl font-semibold">Bedrock AI Assistant</h1>
                <Drawer>
                  <DrawerTrigger asChild>
                    <Button variant="ghost" size="icon" className="md:hidden">
                      <SettingsIcon className="size-4" />
                      <span className="sr-only">Settings</span>
                    </Button>
                  </DrawerTrigger>
                  <DrawerContent className="max-h-[80vh]">
                    <DrawerHeader>
                      <DrawerTitle>Configuration</DrawerTitle>
                      <DrawerDescription>
                        Configure the settings for the assistant.
                      </DrawerDescription>
                    </DrawerHeader>
                    <form
                      className="grid w-full items-start gap-6 overflow-auto p-4 pt-0"
                      onSubmit={(event) => event.preventDefault()}
                    >
                      <Settings
                        settings={settings}
                        handleSettings={handleSettings}
                      />
                    </form>
                  </DrawerContent>
                </Drawer>
              </header>
              <main className="grid flex-1 gap-4 overflow-auto p-4 md:grid-cols-2 lg:grid-cols-3">
                <div className="relative hidden flex-col items-start gap-8 md:flex">
                  <form
                    className="grid w-full items-start gap-6"
                    onSubmit={(event) => event.preventDefault()}
                  >
                    <Settings
                      settings={settings}
                      handleSettings={handleSettings}
                    />
                  </form>
                </div>
                <Chat settings={settings} />
              </main>
            </div>
          </div>
        )}
      </Authenticator>
    </div>
  );
}
