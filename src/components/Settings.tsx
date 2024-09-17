import { Bird, Rabbit, Turtle } from "lucide-react";
import { Framework, Model, type Settings } from "../App";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Textarea } from "./ui/textarea";

type Props = {
  settings: Settings;
  handleSettings: (settings: Settings) => void;
};

export function Settings({ settings, handleSettings }: Props) {
  return (
    <fieldset className="grid gap-6 rounded-lg border p-4">
      <legend className="-ml-1 px-1 text-sm font-medium">Settings</legend>
      <div className="grid gap-3">
        <Label htmlFor="framework">Framework</Label>
        <Select
          onValueChange={(framework: Framework) =>
            handleSettings({ ...settings, framework })
          }
          defaultValue={settings.framework}
        >
          <SelectTrigger
            id="framework"
            className="items-start [&_[data-description]]:hidden"
          >
            <SelectValue placeholder="Select a framework" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ai">
              <div className="flex items-start gap-3 text-muted-foreground">
                <p>AI SDK</p>
              </div>
            </SelectItem>
            <SelectItem value="langchain">
              <div className="flex items-start gap-3 text-muted-foreground">
                <p>LangChain</p>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3">
        <Label htmlFor="model">Model</Label>
        <Select
          onValueChange={(model: Model) =>
            handleSettings({ ...settings, model })
          }
          defaultValue={settings.model}
        >
          <SelectTrigger
            id="model"
            className="items-start [&_[data-description]]:hidden"
          >
            <SelectValue placeholder="Select a model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="claude-3-5-sonnet">
              <div className="flex items-start gap-3 text-muted-foreground">
                <Rabbit className="size-5" />
                <p>Claude 3.5 Sonnet</p>
              </div>
            </SelectItem>
            <SelectItem value="claude-3-sonnet">
              <div className="flex items-start gap-3 text-muted-foreground">
                <Bird className="size-5" />
                <p>Claude 3 Sonnet</p>
              </div>
            </SelectItem>
            <SelectItem value="claude-3-haiku">
              <div className="flex items-start gap-3 text-muted-foreground">
                <Turtle className="size-5" />
                <p>Claude 3 Haiku</p>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3">
        <Label htmlFor="temperature">Temperature</Label>
        <Input
          id="temperature"
          type="number"
          value={settings.temperature}
          onChange={(event) => {
            handleSettings({
              ...settings,
              temperature: parseFloat(event.target.value),
            });
          }}
        />
      </div>
      <div className="grid gap-3">
        <Label htmlFor="system">System</Label>
        <Textarea
          id="system"
          className="min-h-[9.5rem]"
          value={settings.system}
          onChange={(event) => {
            handleSettings({ ...settings, system: event.target.value });
          }}
        />
      </div>
    </fieldset>
  );
}
