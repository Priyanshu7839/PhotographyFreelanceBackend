import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { supabase } from "../supabase.js";
import { r2 } from "../r2client.js";

export const getClientHeader = async (req, res) => {
  try {
    const { clientId } = req.params;
   

    const {
      data: client,
      error: clientError,
    } = await supabase
      .from("clients")
      .select(`
        client_id,
        client_name,
        event_name,
        event_date,
        event_location
      `)
      .eq("client_id", clientId)
      .single();

    if (clientError) {
      return res.status(404).json({
        success: false,
        message: "Client not found",
      });
    }

    const {
      data: projectSteps,
      error: stepsError,
    } = await supabase
      .from("project_steps")
      .select("step_status")
      .eq("client_id", clientId);

    if (stepsError) {
      return res.status(500).json({
        success: false,
        message: stepsError.message,
      });
    }

    const totalSteps = projectSteps.length;

    const completedSteps =
      projectSteps.filter(
        (step) =>
          step.step_status === "completed"
      ).length;

    const ongoingStep =
      projectSteps.find(
        (step) =>
          step.step_status === "ongoing"
      );

    let projectStatus = "Not Started";

    if (completedSteps === totalSteps && totalSteps > 0) {
      projectStatus = "Completed";
    } else if (ongoingStep) {
      projectStatus = "In Progress";
    }

    const progressPercentage =
      totalSteps === 0
        ? 0
        : Math.round(
            (completedSteps / totalSteps) *
              100
          );

    return res.status(200).json({
      success: true,
      data: {
        client_id: client.client_id,
        client_name: client.client_name,
        event_name: client.event_name,
        event_date: client.event_date,
        event_location:client.event_location,

        project_status: projectStatus,

        progress_percentage:
          progressPercentage,

        total_steps: totalSteps,

        completed_steps:
          completedSteps,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateWorkflowStatus = async (
  req,
  res
) => {
  try {
    const { clientId } = req.params;
    const { action } = req.body;

    const memberId =
      req.user.member_id;

    const {
      data: currentStep,
      error: stepError,
    } = await supabase
      .from("project_steps")
      .select("*")
      .eq("client_id", clientId)
      .eq(
        "assigned_member_id",
        memberId
      )
      .single();

    if (stepError || !currentStep) {
      return res.status(404).json({
        success: false,
        message:
          "No step assigned to this member",
      });
    }

    // START TASK
    if (action === "start") {
      if (
        currentStep.step_status ===
        "in_progress"
      ) {
        return res.status(400).json({
          success: false,
          message: `${currentStep.step_name} is already started`,
        });
      }

      if (
        currentStep.step_status ===
        "completed"
      ) {
        return res.status(400).json({
          success: false,
          message: `${currentStep.step_name} is already completed`,
        });
      }

      const {
        data: ongoingSteps,
        error: ongoingError,
      } = await supabase
        .from("project_steps")
        .select(`
          step_name,
          assigned_member_id
        `)
        .eq("client_id", clientId)
        .eq(
          "step_status",
          "in_progress"
        );

      if (ongoingError) {
        throw ongoingError;
      }

      const existingOngoing =
        ongoingSteps?.find(
          (step) =>
            step.assigned_member_id !==
            memberId
        );

      if (existingOngoing) {
        const {
          data: member,
          error: memberError,
        } = await supabase
          .from("members")
          .select("full_name")
          .eq(
            "member_id",
            existingOngoing.assigned_member_id
          )
          .single();

        if (memberError) {
          throw memberError;
        }

        return res.status(400).json({
          success: false,
          message: `${member.full_name} is currently working on ${existingOngoing.step_name}`,
        });
      }

      const {
        error: updateError,
      } = await supabase
        .from("project_steps")
        .update({
          step_status:
            "in_progress",
          started_at:
            new Date().toISOString(),
        })
        .eq(
          "project_step_id",
          currentStep.project_step_id
        );

      if (updateError) {
        throw updateError;
      }

      await supabase
        .from("activity_logs")
        .insert([
          {
            client_id: clientId,
            member_id: memberId,
            activity_message: `Started ${currentStep.step_name}`,
          },
        ]);

      return res.status(200).json({
        success: true,
        message:
          "Task started successfully",
      });
    }

    // WORKING UPDATE
    if (action === "working") {
      if (
        currentStep.step_status ===
        "completed"
      ) {
        return res.status(400).json({
          success: false,
          message: `${currentStep.step_name} is already completed`,
        });
      }

      await supabase
        .from("activity_logs")
        .insert([
          {
            client_id: clientId,
            member_id: memberId,
            activity_message: `Working on ${currentStep.step_name}`,
          },
        ]);

      return res.status(200).json({
        success: true,
        message:
          "Progress updated",
      });
    }

    // FINISH TASK
    if (action === "finish") {
      if (
        currentStep.step_status ===
        "completed"
      ) {
        return res.status(400).json({
          success: false,
          message: `${currentStep.step_name} is already completed`,
        });
      }

      if (
        currentStep.step_status !==
        "in_progress"
      ) {
        return res.status(400).json({
          success: false,
          message: `Please start ${currentStep.step_name} first`,
        });
      }

      const {
        error: updateError,
      } = await supabase
        .from("project_steps")
        .update({
          step_status: "completed",
          completed_at:
            new Date().toISOString(),
        })
        .eq(
          "project_step_id",
          currentStep.project_step_id
        );

      if (updateError) {
        throw updateError;
      }

      await supabase
        .from("activity_logs")
        .insert([
          {
            client_id: clientId,
            member_id: memberId,
            activity_message: `Finished ${currentStep.step_name}`,
          },
        ]);

      return res.status(200).json({
        success: true,
        message:
          "Task completed successfully",
      });
    }

    return res.status(400).json({
      success: false,
      message: "Invalid action",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


export const getClientOverview = async (
  req,
  res
) => {
  try {
    const { clientId } = req.params;

    // =========================
    // PROJECT STEPS
    // =========================

    const {
      data: projectSteps,
      error: stepsError,
    } = await supabase
      .from("project_steps")
      .select("*")
      .eq("client_id", clientId)
      .order("step_order", {
        ascending: true,
      });

    if (stepsError) {
      throw stepsError;
    }

    // =========================
    // CURRENT STEP
    // =========================

    let currentStep =
      projectSteps.find(
        (step) =>
          step.step_status ===
          "in_progress"
      ) ||
      projectSteps[0] ||
      null;

    let assignedMember = null;

    if (
      currentStep?.assigned_member_id
    ) {
      const {
        data: member,
        error: memberError,
      } = await supabase
        .from("members")
        .select("full_name")
        .eq(
          "member_id",
          currentStep.assigned_member_id
        )
        .single();

      if (memberError) {
        throw memberError;
      }

      assignedMember =
        member.full_name;
    }

    // =========================
    // RECENT ACTIVITIES
    // =========================

    const {
      data: activities,
      error: activityError,
    } = await supabase
      .from("activity_logs")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", {
        ascending: false,
      })
      .limit(10);

    if (activityError) {
      throw activityError;
    }

    const recentActivities =
      await Promise.all(
        (activities || []).map(
          async (activity) => {
            let memberName =
              "System";

            if (
              activity.member_id
            ) {
              const {
                data: member,
              } = await supabase
                .from("members")
                .select(
                  "full_name"
                )
                .eq(
                  "member_id",
                  activity.member_id
                )
                .single();

              memberName =
                member?.full_name ||
                "Unknown";
            }

            return {
              activity_message:
                activity.activity_message,

              member_name:
                memberName,

              created_at:
                activity.created_at,
            };
          }
        )
      );

    // =========================
    // TOTAL ASSETS
    // =========================

    const {
      count: totalAssets,
      error: assetsError,
    } = await supabase
      .from("files")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("client_id", clientId);

    if (assetsError) {
      throw assetsError;
    }

    // =========================
    // MOODBOARD
    // =========================

    let totalMoodboardDiscussions =
      0;

    const {
      data: moodboard,
      error: moodboardError,
    } = await supabase
      .from("moodboards")
      .select("moodboard_id")
      .eq("client_id", clientId)
      .single();

    if (
      moodboard &&
      !moodboardError
    ) {
      const {
        count,
        error:
          discussionError,
      } = await supabase
        .from(
          "moodboard_discussions"
        )
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "moodboard_id",
          moodboard.moodboard_id
        );

      if (discussionError) {
        throw discussionError;
      }

      totalMoodboardDiscussions =
        count || 0;
    }

    // =========================
    // PROJECT STATS
    // =========================

    const totalSteps =
      projectSteps.length;

    const completedSteps =
      projectSteps.filter(
        (step) =>
          step.step_status ===
          "completed"
      ).length;

    const completionPercentage =
      totalSteps === 0
        ? 0
        : Math.round(
            (completedSteps /
              totalSteps) *
              100
          );

    const uniqueMembers =
      new Set(
        projectSteps
          .filter(
            (step) =>
              step.assigned_member_id
          )
          .map(
            (step) =>
              step.assigned_member_id
          )
      );

    return res.status(200).json({
      success: true,
      data: {
        current_step:
          currentStep
            ? {
                step_name:
                  currentStep.step_name,

                assigned_member:
                  assignedMember,

                step_status:
                  currentStep.step_status,
              }
            : null,

        recent_activities:
          recentActivities,

        project_stats: {
          total_assets:
            totalAssets || 0,

          total_team_members:
            uniqueMembers.size,

          total_steps:
            totalSteps,

          completed_steps:
            completedSteps,

          completion_percentage:
            completionPercentage,

          total_moodboard_discussions:
            totalMoodboardDiscussions,
        },
      },
    });
  } catch (error) {
    console.error(
      "Overview Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error?.message ||
        "Internal Server Error",
    });
  }
};

export const getClientWorkflow = async (
  req,
  res
) => {
  try {
    const { clientId } = req.params;

    const memberId =
      req.user.member_id;

    const {
      data: projectSteps,
      error: stepsError,
    } = await supabase
      .from("project_steps")
      .select("*")
      .eq("client_id", clientId)
      .order("step_order", {
        ascending: true,
      });

    if (stepsError) {
      throw stepsError;
    }

    const workflowData =
      await Promise.all(
        projectSteps.map(
          async (step) => {
            let assignedMember =
              null;

            if (
              step.assigned_member_id
            ) {
              const {
                data: member,
              } = await supabase
                .from("members")
                .select(
                  "full_name"
                )
                .eq(
                  "member_id",
                  step.assigned_member_id
                )
                .single();

              assignedMember =
                member?.full_name ||
                null;
            }

            return {
              project_step_id:
                step.project_step_id,

              step_name:
                step.step_name,

              step_order:
                step.step_order,

              step_status:
                step.step_status,

              assigned_member:
                assignedMember,

              assigned_member_id:
                step.assigned_member_id,

                completed_at:step.completed_at,

              is_my_step:
                step.assigned_member_id ===
                memberId,
            };
          }
        )
      );

    return res.status(200).json({
      success: true,
      data: workflowData,
    });
  } catch (error) {
    console.error(
      "Workflow Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error?.message ||
        "Internal Server Error",
    });
  }
};


export const addMoodboardDiscussion =
  async (req, res) => {
    try {
      const { clientId } =
        req.params;

      const { message } =
        req.body;

      if (!message?.trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Message is required",
        });
      }

      // Get Moodboard
      const {
        data: moodboard,
        error: moodboardError,
      } = await supabase
        .from("moodboards")
        .select("moodboard_id")
        .eq(
          "client_id",
          clientId
        )
        .single();

      if (
        moodboardError ||
        !moodboard
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Moodboard not found",
        });
      }

      let memberId = null;
      let messageByRole =
        "client";

      // Team Member
      if (
        req.user.user_type ===
        "member"
      ) {
        memberId =
          req.user.member_id;

        messageByRole = "member";
      }

      const {
        error: discussionError,
      } = await supabase
        .from(
          "moodboard_discussions"
        )
        .insert([
          {
            moodboard_id:
              moodboard.moodboard_id,

            member_id:
              memberId,

            message,

            message_by_role:
              messageByRole,
          },
        ]);

      if (discussionError) {
        throw discussionError;
      }

      return res.status(201).json({
        success: true,
        message:
          "Discussion added successfully",
      });
    } catch (error) {
      console.error(
        "Moodboard Discussion Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Internal Server Error",
      });
    }
  };

  export const getMoodboardDiscussions =
  async (req, res) => {
    try {
      const { clientId } =
        req.params;

      // get moodboard
      const {
        data: moodboard,
        error: moodboardError,
      } = await supabase
        .from("moodboards")
        .select("moodboard_id")
        .eq(
          "client_id",
          clientId
        )
        .single();

      if (
        moodboardError ||
        !moodboard
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Moodboard not found",
        });
      }

      // get client
      const {
        data: client,
        error: clientError,
      } = await supabase
        .from("clients")
        .select("client_name")
        .eq(
          "client_id",
          clientId
        )
        .single();

      if (clientError) {
        throw clientError;
      }

      const {
        data: discussions,
        error:
          discussionError,
      } = await supabase
        .from(
          "moodboard_discussions"
        )
        .select("*")
        .eq(
          "moodboard_id",
          moodboard.moodboard_id
        )
        .order("created_at", {
          ascending: true,
        });

      if (discussionError) {
        throw discussionError;
      }

      const formattedData =
        await Promise.all(
          discussions.map(
            async (
              discussion
            ) => {
              let memberName =
                client.client_name;

              if (
                discussion.message_by_role ===
                "member"
              ) {
                const {
                  data: member,
                } = await supabase
                  .from(
                    "members"
                  )
                  .select(
                    "full_name"
                  )
                  .eq(
                    "member_id",
                    discussion.member_id
                  )
                  .single();

                memberName =
                  member?.full_name ||
                  "Unknown";
              }

              return {
                discussion_id:
                  discussion.discussion_id,

                member_name:
                  memberName,

                message:
                  discussion.message,

                message_by_role:
                  discussion.message_by_role,

                created_at:
                  discussion.created_at,
              };
            }
          )
        );

      return res.status(200).json({
        success: true,
        data: formattedData,
      });
    } catch (error) {
      console.error(
        "Moodboard Discussion Fetch Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Internal Server Error",
      });
    }
  };

  export const updateClientNotes =
  async (req, res) => {
    try {
      const { clientId } =
        req.params;

      const { client_notes } =
        req.body;

      if (
        client_notes ===
        undefined
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Client notes are required",
        });
      }

      const {
        data: moodboard,
        error: moodboardError,
      } = await supabase
        .from("moodboards")
        .select(
          "moodboard_id"
        )
        .eq(
          "client_id",
          clientId
        )
        .single();

      if (
        moodboardError ||
        !moodboard
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Moodboard not found",
        });
      }

      const {
        error: updateError,
      } = await supabase
        .from("moodboards")
        .update({
          client_notes,
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "moodboard_id",
          moodboard.moodboard_id
        );

      if (updateError) {
        throw updateError;
      }

      return res.status(200).json({
        success: true,
        message:
          "Client notes updated successfully",
      });
    } catch (error) {
      console.error(
        "Update Client Notes Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Internal Server Error",
      });
    }
  };

  export const getClientNotes =
  async (req, res) => {
    try {
      const { clientId } =
        req.params;

      const {
        data: moodboard,
        error: moodboardError,
      } = await supabase
        .from("moodboards")
        .select(
          `
          moodboard_id,
          moodboard_title,
          client_notes,
          updated_at
        `
        )
        .eq(
          "client_id",
          clientId
        )
        .single();

      if (
        moodboardError ||
        !moodboard
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Moodboard not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: moodboard,
      });
    } catch (error) {
      console.error(
        "Get Client Notes Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Internal Server Error",
      });
    }
  };

  export const addMoodboardSong =
  async (req, res) => {
    try {
      const { clientId } =
        req.params;

      const { song_name } =
        req.body;

      if (!song_name?.trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Song name is required",
        });
      }

      // get moodboard
      const {
        data: moodboard,
        error: moodboardError,
      } = await supabase
        .from("moodboards")
        .select("moodboard_id")
        .eq(
          "client_id",
          clientId
        )
        .single();

      if (
        moodboardError ||
        !moodboard
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Moodboard not found",
        });
      }

      const {
        error: songError,
      } = await supabase
        .from(
          "moodboard_songs"
        )
        .insert([
          {
            moodboard_id:
              moodboard.moodboard_id,

            song_name:
              song_name.trim(),
          },
        ]);

      if (songError) {
        throw songError;
      }

      return res.status(201).json({
        success: true,
        message:
          "Song added successfully",
      });
    } catch (error) {
      console.error(
        "Add Song Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Internal Server Error",
      });
    }
  };

  export const getMoodboardSongs =
  async (req, res) => {
    try {
      const { clientId } =
        req.params;

      // Get moodboard
      const {
        data: moodboard,
        error: moodboardError,
      } = await supabase
        .from("moodboards")
        .select("moodboard_id")
        .eq(
          "client_id",
          clientId
        )
        .single();

      if (
        moodboardError ||
        !moodboard
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Moodboard not found",
        });
      }

      const {
        data: songs,
        error: songsError,
      } = await supabase
        .from(
          "moodboard_songs"
        )
        .select("*")
        .eq(
          "moodboard_id",
          moodboard.moodboard_id
        )
        .order("created_at", {
          ascending: false,
        });

      if (songsError) {
        throw songsError;
      }

      return res.status(200).json({
        success: true,
        data: songs,
      });
    } catch (error) {
      console.error(
        "Get Songs Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Internal Server Error",
      });
    }
  };

  export const deleteMoodboardSong =
  async (req, res) => {
    try {
      const { songId } =
        req.params;

      const {
        error: deleteError,
      } = await supabase
        .from(
          "moodboard_songs"
        )
        .delete()
        .eq(
          "moodboard_song_id",
          songId
        );

      if (deleteError) {
        throw deleteError;
      }

      return res.status(200).json({
        success: true,
        message:
          "Song deleted successfully",
      });
    } catch (error) {
      console.error(
        "Delete Song Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Internal Server Error",
      });
    }
  };

 export const getProductionSetup =
  async (req, res) => {
    try {
      const { clientId } =
        req.params;

      const currentMemberId =
        req.user.user_type ===
        "member"
          ? req.user.member_id
          : null;

      // Get assigned members + steps
      const {
        data: projectSteps,
        error: projectStepsError,
      } = await supabase
        .from("project_steps")
        .select(`
          assigned_member_id,
          step_name
        `)
        .eq(
          "client_id",
          clientId
        );

      if (projectStepsError) {
        throw projectStepsError;
      }

      const memberIds = [
        ...new Set(
          projectSteps
            .filter(
              (step) =>
                step.assigned_member_id
            )
            .map(
              (step) =>
                step.assigned_member_id
            )
        ),
      ];

      if (!memberIds.length) {
        return res.status(200).json({
          success: true,
          data: [],
        });
      }

      // Get members
      const {
        data: members,
        error: membersError,
      } = await supabase
        .from("members")
        .select(`
          member_id,
          full_name,
          role
        `)
        .in(
          "member_id",
          memberIds
        );

      if (membersError) {
        throw membersError;
      }

      // Get gear assignments
      const {
        data: gearAssignments,
        error: assignmentsError,
      } = await supabase
        .from("gears_assigned")
        .select(`
          member_id,
          gear_id
        `)
        .eq(
          "client_id",
          clientId
        );

      if (assignmentsError) {
        throw assignmentsError;
      }

      // Get all gears so all categories always exist
      const {
        data: allGears,
        error: gearsError,
      } = await supabase
        .from("gears")
        .select(`
          gear_id,
          gear_name,
          gear_category
        `);

      if (gearsError) {
        throw gearsError;
      }

      const response =
        members.map(
          (member) => {
            const memberGears =
              gearAssignments.filter(
                (assignment) =>
                  assignment.member_id ===
                  member.member_id
              );

            const memberStep =
              projectSteps.find(
                (step) =>
                  step.assigned_member_id ===
                  member.member_id
              );

            const categorized =
              {};

            // Create all categories dynamically
            allGears.forEach(
              (gear) => {
                if (
                  !categorized[
                    gear.gear_category
                  ]
                ) {
                  categorized[
                    gear.gear_category
                  ] = [];
                }
              }
            );

            // Populate assigned gears
            memberGears.forEach(
              (assignment) => {
                const gear =
                  allGears.find(
                    (g) =>
                      g.gear_id ===
                      assignment.gear_id
                  );

                if (!gear) return;

                categorized[
                  gear.gear_category
                ].push({
                  gear_id:
                    gear.gear_id,

                  gear_name:
                    gear.gear_name,
                });
              }
            );

            return {
              member_id:
                member.member_id,

              member_name:
                member.full_name,

              role:
                member.role,

              step_name:
                memberStep?.step_name ||
                null,

              is_my_step:
                currentMemberId !==
                  null &&
                currentMemberId ===
                  member.member_id,

              gears_using:
                categorized,
            };
          }
        );

      return res.status(200).json({
        success: true,
        data: response,
      });
    } catch (error) {
      console.error(
        "Production Setup Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Internal Server Error",
      });
    }
  };
  export const getAllGears =
  async (req, res) => {
    try {
      const {
        data: gears,
        error,
      } = await supabase
        .from("gears")
        .select(`
          gear_id,
          gear_name,
          gear_category
        `)
        .order(
          "gear_name",
          {
            ascending: true,
          }
        );

      if (error) {
        throw error;
      }

      const categorized = {};

      gears.forEach(
        (gear) => {
          const category =
            gear.gear_category;

          if (
            !categorized[
              category
            ]
          ) {
            categorized[
              category
            ] = [];
          }

          categorized[
            category
          ].push({
            gear_id:
              gear.gear_id,

            gear_name:
              gear.gear_name,
          });
        }
      );

      return res.status(200).json({
        success: true,
        data: categorized,
      });
    } catch (error) {
      console.error(
        "Get Gears Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Internal Server Error",
      });
    }
  };

  export const assignGears =
  async (req, res) => {
    try {
      const { clientId } =
        req.params;

      if (
        req.user.user_type !==
        "member"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Only team members can assign gears",
        });
      }

      const memberId =
        req.user.member_id;

      const { gears_using } =
        req.body;

      if (!gears_using) {
        return res.status(400).json({
          success: false,
          message:
            "gears_using is required",
        });
      }

      // Extract all gear ids from all categories
      const incomingGearIds =
        Object.values(
          gears_using
        )
          .flat()
          .map(
            (gear) =>
              gear.gear_id
          );

      // Check if any incoming gear is assigned
      // to another member in same client
      const {
        data: conflictingAssignments,
        error:
          conflictError,
      } = await supabase
        .from(
          "gears_assigned"
        )
        .select(`
          gear_id,
          member_id
        `)
        .eq(
          "client_id",
          clientId
        )
        .in(
          "gear_id",
          incomingGearIds
        );

      if (conflictError) {
        throw conflictError;
      }

      const conflict =
        conflictingAssignments?.find(
          (assignment) =>
            assignment.member_id !==
            memberId
        );

      if (conflict) {
        const [
          gearResult,
          memberResult,
        ] = await Promise.all([
          supabase
            .from("gears")
            .select(
              "gear_name"
            )
            .eq(
              "gear_id",
              conflict.gear_id
            )
            .single(),

          supabase
            .from("members")
            .select(
              "full_name"
            )
            .eq(
              "member_id",
              conflict.member_id
            )
            .single(),
        ]);

        return res.status(400).json({
          success: false,
          message: `${gearResult.data?.gear_name} already assigned to ${memberResult.data?.full_name}`,
        });
      }

      // Existing assignments for this member
      const {
        data:
          existingAssignments,
        error:
          existingError,
      } = await supabase
        .from(
          "gears_assigned"
        )
        .select(`
          gear_assignment_id,
          gear_id
        `)
        .eq(
          "client_id",
          clientId
        )
        .eq(
          "member_id",
          memberId
        );

      if (existingError) {
        throw existingError;
      }

      const existingGearIds =
        existingAssignments.map(
          (assignment) =>
            assignment.gear_id
        );

      // Gear ids to remove
      const gearIdsToDelete =
        existingAssignments
          .filter(
            (assignment) =>
              !incomingGearIds.includes(
                assignment.gear_id
              )
          )
          .map(
            (assignment) =>
              assignment.gear_assignment_id
          );

      // Gear ids to add
      const gearIdsToInsert =
        incomingGearIds.filter(
          (gearId) =>
            !existingGearIds.includes(
              gearId
            )
        );

      // Delete removed gears
      if (
        gearIdsToDelete.length
      ) {
        const {
          error:
            deleteError,
        } = await supabase
          .from(
            "gears_assigned"
          )
          .delete()
          .in(
            "gear_assignment_id",
            gearIdsToDelete
          );

        if (deleteError) {
          throw deleteError;
        }
      }

      // Insert new gears
      if (
        gearIdsToInsert.length
      ) {
        const rows =
          gearIdsToInsert.map(
            (gearId) => ({
              client_id:
                clientId,

              member_id:
                memberId,

              gear_id: gearId,
            })
          );

        const {
          error:
            insertError,
        } = await supabase
          .from(
            "gears_assigned"
          )
          .insert(rows);

        if (insertError) {
          throw insertError;
        }
      }

      return res.status(200).json({
        success: true,
        message:
          "Gear assignment updated successfully",
      });
    } catch (error) {
      console.error(
        "Assign Gear Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Internal Server Error",
      });
    }
  };

  export const getProductionOverview =
  async (req, res) => {
    try {
      const { clientId } =
        req.params;

      // Total unique members working on this client
      const {
        data: projectSteps,
        error: projectStepsError,
      } = await supabase
        .from("project_steps")
        .select(
          "assigned_member_id"
        )
        .eq(
          "client_id",
          clientId
        );

      if (projectStepsError) {
        throw projectStepsError;
      }

      const totalMembers =
        new Set(
          projectSteps
            .filter(
              (step) =>
                step.assigned_member_id
            )
            .map(
              (step) =>
                step.assigned_member_id
            )
        ).size;

      // Get assigned gears
      const {
        data: gearAssignments,
        error: assignmentsError,
      } = await supabase
        .from("gears_assigned")
        .select("gear_id")
        .eq(
          "client_id",
          clientId
        );

      if (assignmentsError) {
        throw assignmentsError;
      }

      const gearIds = [
        ...new Set(
          gearAssignments.map(
            (g) => g.gear_id
          )
        ),
      ];

      // Get all categories
      const {
        data: allGears,
        error: gearsError,
      } = await supabase
        .from("gears")
        .select(`
          gear_id,
          gear_category
        `);

      if (gearsError) {
        throw gearsError;
      }

      const gearSummary =
        {};

      // Initialize all categories to 0
      allGears.forEach(
        (gear) => {
          if (
            !gearSummary[
              gear.gear_category
            ]
          ) {
            gearSummary[
              gear.gear_category
            ] = 0;
          }
        }
      );

      // Count assigned gears by category
      allGears.forEach(
        (gear) => {
          if (
            gearIds.includes(
              gear.gear_id
            )
          ) {
            gearSummary[
              gear.gear_category
            ] += 1;
          }
        }
      );

      return res.status(200).json({
        success: true,
        data: {
          total_members:
            totalMembers,

          gear_summary:
            gearSummary,
        },
      });
    } catch (error) {
      console.error(
        "Production Overview Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Internal Server Error",
      });
    }
  };

  export const addTravelDiscussion =
  async (req, res) => {
    try {
      const { clientId } =
        req.params;

      const { message } =
        req.body;

      if (!message?.trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Message is required",
        });
      }

      let memberId = null;

      let messageByRole =
        "client";

      // Team Member
      if (
        req.user.user_type ===
        "member"
      ) {
        memberId =
          req.user.member_id;

        messageByRole =
          "member";
      }

      const {
        error:
          discussionError,
      } = await supabase
        .from(
          "travel_discussions"
        )
        .insert([
          {
            client_id:
              clientId,

            member_id:
              memberId,

            message,

            message_by_role:
              messageByRole,
          },
        ]);

      if (
        discussionError
      ) {
        throw discussionError;
      }

      return res.status(201).json({
        success: true,
        message:
          "Travel discussion added successfully",
      });
    } catch (error) {
      console.error(
        "Travel Discussion Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Internal Server Error",
      });
    }
  };

  export const getTravelDiscussions =
  async (req, res) => {
    try {
      const { clientId } =
        req.params;

      // get client
      const {
        data: client,
        error: clientError,
      } = await supabase
        .from("clients")
        .select("client_name")
        .eq(
          "client_id",
          clientId
        )
        .single();

      if (
        clientError ||
        !client
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Client not found",
        });
      }

      const {
        data: discussions,
        error:
          discussionError,
      } = await supabase
        .from(
          "travel_discussions"
        )
        .select("*")
        .eq(
          "client_id",
          clientId
        )
        .order("created_at", {
          ascending: true,
        });

      if (
        discussionError
      ) {
        throw discussionError;
      }

      const formattedData =
        await Promise.all(
          discussions.map(
            async (
              discussion
            ) => {
              let memberName =
                client.client_name;

              if (
                discussion.message_by_role ===
                "member"
              ) {
                const {
                  data: member,
                } = await supabase
                  .from(
                    "members"
                  )
                  .select(
                    "full_name"
                  )
                  .eq(
                    "member_id",
                    discussion.member_id
                  )
                  .single();

                memberName =
                  member?.full_name ||
                  "Unknown";
              }

              return {
                travel_discussion_id:
                  discussion.travel_discussion_id,

                member_name:
                  memberName,

                message:
                  discussion.message,

                message_by_role:
                  discussion.message_by_role,

                created_at:
                  discussion.created_at,
              };
            }
          )
        );

      return res.status(200).json({
        success: true,
        data: formattedData,
      });
    } catch (error) {
      console.error(
        "Travel Discussion Fetch Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Internal Server Error",
      });
    }
  };

  export const getTravelData =
  async (req, res) => {
    try {
      const { clientId } =
        req.params;

      // Client Travel Info
      const {
        data: client,
        error: clientError,
      } = await supabase
        .from("clients")
        .select(`
          driving_distance,
          travel_fee
        `)
        .eq(
          "client_id",
          clientId
        )
        .single();

      if (
        clientError ||
        !client
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Client not found",
        });
      }

      // Team Members & Steps
      const {
        data: steps,
        error: stepsError,
      } = await supabase
        .from("project_steps")
        .select(`
          assigned_member_id,
          step_name
        `)
        .eq(
          "client_id",
          clientId
        )
        .not(
          "assigned_member_id",
          "is",
          null
        );

      if (stepsError) {
        throw stepsError;
      }

      const memberIds = [
        ...new Set(
          steps.map(
            (step) =>
              step.assigned_member_id
          )
        ),
      ];

      let members = [];

      if (
        memberIds.length
      ) {
        const {
          data: memberData,
          error: memberError,
        } = await supabase
          .from("members")
          .select(`
            member_id,
            full_name
          `)
          .in(
            "member_id",
            memberIds
          );

        if (
          memberError
        ) {
          throw memberError;
        }

        members =
          memberData;
      }

      const teamMembers =
        steps.map(
          (step) => {
            const member =
              members.find(
                (m) =>
                  m.member_id ===
                  step.assigned_member_id
              );

            return {
              member_name:
                member?.full_name ||
                "Unknown",

              step_name:
                step.step_name,
            };
          }
        );

      return res.status(200).json({
        success: true,

        data: {
          total_distance:
            client.driving_distance,

          total_travel_fee:
            client.travel_fee,

          team_members:
            teamMembers,
        },
      });
    } catch (error) {
      console.error(
        "Travel Data Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Internal Server Error",
      });
    }
  };

  export const getMoodboardAssets =
  async (req, res) => {
    try {
      const { clientId } =
        req.params;

      const {
        data: files,
        error,
      } = await supabase
        .from("files")
        .select("*")
        .eq(
          "client_id",
          clientId
        )
        .eq(
          "file_category",
          "moodboard"
        )
        .order(
          "created_at",
          {
            ascending: false,
          }
        );

      if (error) {
        throw error;
      }

      const filesWithPreview =
        await Promise.all(
          files.map(
            async (file) => {
              const command =
                new GetObjectCommand({
                  Bucket:
                    process.env
                      .R2_BUCKET,
                  Key:
                    file.object_storage_key,
                });

              const previewUrl =
                await getSignedUrl(
                  r2,
                  command,
                  {
                    expiresIn:
                      3600,
                  }
                );

              return {
                ...file,
                preview_url:
                  previewUrl,
              };
            }
          )
        );

      return res.status(200).json({
        success: true,
        data:
          filesWithPreview,
      });
    } catch (error) {
      console.error(
        "Moodboard Assets Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error?.message ||
          "Internal Server Error",
      });
    }
  };