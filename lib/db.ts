import { supabase } from "./supabase";

export async function createConversation(title: string = "New Conversation") {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ title })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getMessages(conversationId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

export async function saveMessage(conversationId: string, role: string, content: string, senderName: string = "User") {
    const { data, error } = await supabase
      .from("messages")
      .insert({ conversation_id: conversationId, role, content, sender_name: senderName })
      .select()
      .single();
  
    if (error) throw error;
    return data;
  }

export async function pinMessage(messageId: string, isPinned: boolean) {
  const { error } = await supabase
    .from("messages")
    .update({ is_pinned: isPinned })
    .eq("id", messageId);

  if (error) throw error;
}

export async function getPinnedMessages(conversationId: string) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("is_pinned", true)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data;
}

export async function createBranch(parentConversationId: string, branchedFromMessageId: string) {
    const { data, error } = await supabase
      .from("branches")
      .insert({ 
        parent_conversation_id: parentConversationId, 
        branched_from_message_id: branchedFromMessageId 
      })
      .select()
      .single();
  
    if (error) throw error;
    return data;
  }
  
  export async function getBranches(conversationId: string) {
    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .eq("parent_conversation_id", conversationId);
  
    if (error) throw error;
    return data;
  }

  export async function generateShareToken(conversationId: string) {
    const token = Math.random().toString(36).substring(2, 15);
    
    const { data, error } = await supabase
      .from("conversations")
      .update({ share_token: token })
      .eq("id", conversationId)
      .select()
      .single();
  
    if (error) throw error;
    return token;
  }
  
  export async function getConversationByToken(token: string) {
    const { data, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("share_token", token)
      .single();
  
    if (error) throw error;
    return data;
  }

  export async function saveMemory(conversationId: string, content: string) {
    const { data, error } = await supabase
      .from("memories")
      .insert({ conversation_id: conversationId, content })
      .select()
      .single();
  
    if (error) throw error;
    return data;
  }
  
  export async function getMemories(conversationId: string) {
    const { data, error } = await supabase
      .from("memories")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
  
    if (error) throw error;
    return data;
  }