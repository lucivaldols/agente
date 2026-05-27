/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ToolExecution {
  icon: string;
  label: string;
  text?: string;
}

export interface FileData {
  name: string;
  size: number;
  type: string;
  url?: string;
  data?: string; // base64 representation if sent to api
}

export interface Message {
  id: string;
  user_message: string;
  ai_response: string;
  timestamp: string;
  tools?: ToolExecution[];
  file?: FileData;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  lastMessage?: string;
  messages: Message[];
}
