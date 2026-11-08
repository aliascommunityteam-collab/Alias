export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PostCategory =
  | "Confession"
  | "Story"
  | "School life"
  | "Question";

export type PostStatus = "published" | "hidden" | "removed";
export type PostReaction = "like" | "dislike";
export type ProfileGender = "girl" | "boy";
export type ReportReason =
  | "bullying_harassment"
  | "personal_information"
  | "threats"
  | "inappropriate_content"
  | "spam"
  | "other";
export type ReportStatus = "open" | "reviewing" | "resolved" | "dismissed";

 type Relationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type Table<Row, Insert, Update, Relations extends Relationship[] = []> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Relations;
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      posts: Table<
        {
          id: string;
          author_id: string;
          author_nickname: string | null;
          category: PostCategory;
          content: string;
          gif_id: string | null;
          status: PostStatus;
          created_at: string;
        },
        {
          id?: string;
          author_id?: string;
          author_nickname?: string | null;
          category: PostCategory;
          content: string;
          gif_id?: string | null;
          status?: PostStatus;
          created_at?: string;
        },
        {
          id?: string;
          author_id?: string;
          author_nickname?: string | null;
          category?: PostCategory;
          content?: string;
          gif_id?: string | null;
          status?: PostStatus;
          created_at?: string;
        }
      >;
      comments: Table<
        {
          id: string;
          post_id: string;
          author_id: string;
          author_nickname: string | null;
          content: string;
          status: PostStatus;
          created_at: string;
        },
        {
          id?: string;
          post_id: string;
          content: string;
          author_id?: string;
          author_nickname?: string | null;
          status?: PostStatus;
          created_at?: string;
        },
        {
          id?: string;
          post_id?: string;
          content?: string;
          author_id?: string;
          author_nickname?: string | null;
          status?: PostStatus;
          created_at?: string;
        },
        [
          {
            foreignKeyName: "comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          }
        ]
      >;
      likes: Table<
        {
          author_id: string;
          created_at: string;
          post_id: string;
          reaction: PostReaction;
        },
        {
          author_id?: string;
          created_at?: string;
          post_id: string;
          reaction?: PostReaction;
        },
        {
          author_id?: string;
          created_at?: string;
          post_id?: string;
          reaction?: PostReaction;
        },
        [
          {
            foreignKeyName: "likes_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          }
        ]
      >;
      reports: Table<
        {
          comment_id: string | null;
          created_at: string;
          details: string | null;
          id: string;
          post_id: string | null;
          reason: ReportReason;
          reporter_id: string;
          status: ReportStatus;
        },
        {
          comment_id?: string | null;
          created_at?: string;
          details?: string | null;
          id?: string;
          post_id?: string | null;
          reason: ReportReason;
          reporter_id?: string;
          status?: ReportStatus;
        },
        {
          comment_id?: string | null;
          created_at?: string;
          details?: string | null;
          id?: string;
          post_id?: string | null;
          reason?: ReportReason;
          reporter_id?: string;
          status?: ReportStatus;
        },
        [
          {
            foreignKeyName: "reports_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reports_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          }
        ]
      >;
      private_profiles: Table<
        {
          age: number | null;
          created_at: string;
          gender: ProfileGender | null;
          nickname: string;
          real_name: string;
          updated_at: string;
          user_id: string;
        },
        {
          age?: number | null;
          created_at?: string;
          gender?: ProfileGender | null;
          nickname: string;
          real_name: string;
          updated_at?: string;
          user_id: string;
        },
        {
          age?: number | null;
          created_at?: string;
          gender?: ProfileGender | null;
          nickname?: string;
          real_name?: string;
          updated_at?: string;
          user_id?: string;
        }
      >;
    };
    Views: Record<never, never>;
    Functions: {
      alias_has_active_invite: { Args: Record<PropertyKey, never>; Returns: boolean };
      alias_is_moderator: { Args: Record<PropertyKey, never>; Returns: boolean };
      alias_user_is_suspended: { Args: Record<PropertyKey, never>; Returns: boolean };
      complete_alias_onboarding: {
        Args: {
          p_invite_code: string;
          p_real_name: string;
          p_nickname: string;
          p_age: number;
          p_gender: string;
        };
        Returns: boolean;
      };
      create_alias_invite: {
        Args: { p_max_uses?: number; p_expires_in_days?: number };
        Returns: string;
      };
      get_post_stats: {
        Args: { p_post_ids: string[] };
        Returns: { post_id: string; like_count: number; comment_count: number }[];
      };
      get_post_reaction_stats: {
        Args: { p_post_ids: string[] };
        Returns: {
          post_id: string;
          like_count: number;
          dislike_count: number;
          comment_count: number;
        }[];
      };
      toggle_alias_post_reaction: {
        Args: { p_post_id: string; p_reaction: PostReaction };
        Returns: PostReaction | null;
      };
      moderate_post: { Args: { p_post_id: string; p_action: string }; Returns: boolean };
      moderate_comment: { Args: { p_comment_id: string; p_action: string }; Returns: boolean };
      moderate_reported_author: { Args: { p_report_id: string; p_days: number }; Returns: boolean };
      update_alias_report_status: {
        Args: { p_report_id: string; p_status: string };
        Returns: boolean;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
