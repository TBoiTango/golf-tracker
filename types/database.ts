export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export interface Database {
  public: {
    Tables: {
      rounds: {
        Row: { id: string; date: string; status: string; created_at: string }
        Insert: { id?: string; date?: string; status?: string; created_at?: string }
        Update: { id?: string; date?: string; status?: string }
      }
      foursomes: {
        Row: { id: string; round_id: string; group_number: number }
        Insert: { id?: string; round_id: string; group_number: number }
        Update: { id?: string; group_number?: number }
      }
      players: {
        Row: {
          id: string
          round_id: string
          name: string
          handicap_index: number
          foursome_id: string | null
          vegas_team: number | null
          created_at: string
        }
        Insert: {
          id?: string
          round_id: string
          name: string
          handicap_index?: number
          foursome_id?: string | null
          vegas_team?: number | null
        }
        Update: {
          handicap_index?: number
          foursome_id?: string | null
          vegas_team?: number | null
        }
      }
      scores: {
        Row: {
          id: string
          player_id: string
          hole_number: number
          gross_score: number
          updated_at: string
        }
        Insert: {
          id?: string
          player_id: string
          hole_number: number
          gross_score: number
        }
        Update: { gross_score?: number; updated_at?: string }
      }
    }
  }
}

export type Round    = Database['public']['Tables']['rounds']['Row']
export type Foursome = Database['public']['Tables']['foursomes']['Row']
export type Player   = Database['public']['Tables']['players']['Row']
export type Score    = Database['public']['Tables']['scores']['Row']
