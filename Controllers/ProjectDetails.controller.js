import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { supabase } from "../supabase.js";
import { r2 } from "../r2client.js";

export const getClientHeader = async (req, res) => {
  try {
    const { clientId } = req.params;
   
const { data: client, error: clientError } =
  await supabase
    .from("clients")
    .select(`
      client_id,
      client_name,
      event_name
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
  .select(`
    step_status,
    step_time,
    venue,
    step_order
  `)
  .eq("client_id", clientId)
  .order("step_order", {
    ascending: true,
  });

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
          step.step_status === "in_progress"
      );

    let projectStatus = "Not Started";

    if (completedSteps === totalSteps && totalSteps > 0) {
      projectStatus = "Completed";
    } 
    else if(completedSteps>0){
      projectStatus = "In Progress"
    }
    else if (ongoingStep) {
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
    const { clientId,step_id } = req.params;
    const { action } = req.body;


  

    
    
    
    const memberId =
    req.user.member_id;
    
    
    const {
      data: currentStep,
      error: stepError,
    } = await supabase
      .from("project_steps")
      .select("*")
      .eq("project_step_id", step_id).single()

      console.log(currentStep)
      
      

     

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
    assigned_member_ids
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
      !step.assigned_member_ids?.includes(
        memberId
      )
  );

      if (existingOngoing) {
       const {
  data: members,
  error: memberError,
} = await supabase
  .from("members")
  .select("full_name")
  .in(
    "member_id",
    existingOngoing.assigned_member_ids
  );

if (memberError) {
  throw memberError;
}

const memberNames = members
  .map((m) => m.full_name)
  .join(", ");

return res.status(400).json({
  success: false,
  message: `${memberNames} are currently working on ${existingOngoing.step_name}`,
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
    // CLIENT DETAILS
    // =========================

    const {
      data: client,
      error: clientError,
    } = await supabase
      .from("clients")
      .select(`
        client_name,
        email,
        password
      `)
      .eq(
        "client_id",
        clientId
      )
      .single();

    if (clientError) {
      throw clientError;
    }

    // =========================
    // PROJECT STEPS
    // =========================

    const {
      data: projectSteps,
      error: stepsError,
    } = await supabase
      .from("project_steps")
      .select("*")
      .eq(
        "client_id",
        clientId
      )
      .order(
        "step_order",
        {
          ascending: true,
        }
      );

    if (stepsError) {
      throw stepsError;
    }

    // =========================
    // CURRENT STEP
    // =========================

    const currentStep =
      projectSteps.find(
        (step) =>
          step.step_status ===
          "in_progress"
      ) ||
      projectSteps.find(
        (step) =>
          step.step_status ===
          "pending"
      ) ||
      projectSteps[
        projectSteps.length - 1
      ] ||
      null;

    let assignedMembers = [];

    if (
      currentStep?.assigned_member_ids?.length
    ) {
      const {
        data: members,
        error: memberError,
      } = await supabase
        .from("members")
        .select("full_name")
        .in(
          "member_id",
          currentStep.assigned_member_ids
        );

      if (memberError) {
        throw memberError;
      }

      assignedMembers =
        members.map(
          (member) =>
            member.full_name
        );
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
      .eq(
        "client_id",
        clientId
      )
      .order(
        "created_at",
        {
          ascending: false,
        }
      )
      .limit(10);

    if (activityError) {
      throw activityError;
    }

    const recentActivities =
      await Promise.all(
        (
          activities || []
        ).map(
          async (
            activity
          ) => {
            let memberName =
              "System";

            if (
              activity.member_id
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
      .eq(
        "client_id",
        clientId
      );

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
      .select(
        "moodboard_id"
      )
      .eq(
        "client_id",
        clientId
      )
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
          count:
            "exact",
          head: true,
        })
        .eq(
          "moodboard_id",
          moodboard.moodboard_id
        );

      if (
        discussionError
      ) {
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
            (
              completedSteps /
              totalSteps
            ) * 100
          );

    const uniqueMembers =
      new Set(
        projectSteps.flatMap(
          (step) =>
            step.assigned_member_ids ||
            []
        )
      );

    return res.status(200).json({
      success: true,

      data: {
        client_details: {
          client_name:
            client.client_name,

          email:
            client.email,

          password:
            client.password,
        },

        current_step:
          currentStep
            ? {
                step_name:
                  currentStep.step_name,

                assigned_members:
                  assignedMembers,

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
            let assignedMembers = [];

            if (
              step.assigned_member_ids?.length
            ) {
              const {
                data: members,
                error: memberError,
              } = await supabase
                .from("members")
                .select(
                  "member_id, full_name"
                )
                .in(
                  "member_id",
                  step.assigned_member_ids
                );

              if (memberError) {
                throw memberError;
              }

              assignedMembers =
                members || [];
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

              assigned_members:
                assignedMembers,

              assigned_member_ids:
                step.assigned_member_ids,

              completed_at:
                step.completed_at,

              is_my_step:
                step.assigned_member_ids?.includes(
                  memberId
                ) || false,
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
        !client_notes?.trim()
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
        .select(`
          moodboard_id,
          client_notes
        `)
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

      const existingNotes =
        moodboard.client_notes || "";

      const updatedNotes =
        existingNotes.trim()
          ? `${existingNotes}\n\n${client_notes.trim()}`
          : client_notes.trim();

      const {
        error: updateError,
      } = await supabase
        .from("moodboards")
        .update({
          client_notes:
            updatedNotes,
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
        req.user.user_type === "member"
          ? req.user.member_id
          : null;

      // Get assigned members + steps
      const {
        data: projectSteps,
        error: projectStepsError,
      } = await supabase
        .from("project_steps")
        .select(`
          assigned_member_ids,
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
          projectSteps.flatMap(
            (step) =>
              step.assigned_member_ids || []
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

      // Get all gears
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
        members.map((member) => {
          const memberGears =
            gearAssignments.filter(
              (assignment) =>
                assignment.member_id ===
                member.member_id
            );

          const memberSteps =
            projectSteps.filter(
              (step) =>
                step.assigned_member_ids?.includes(
                  member.member_id
                )
            );

          const categorized = {};

          // Create all gear categories
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

            step_names:
              memberSteps.map(
                (step) =>
                  step.step_name
              ),

            is_my_step:
              currentMemberId !==
                null &&
              currentMemberId ===
                member.member_id,

            gears_using:
              categorized,
          };
        });

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

      // Ensure member is assigned to at least one workflow step
      const {
        data: assignedSteps,
        error: assignedStepsError,
      } = await supabase
        .from("project_steps")
        .select("project_step_id")
        .eq(
          "client_id",
          clientId
        )
        .contains(
          "assigned_member_ids",
          [memberId]
        );

      if (assignedStepsError) {
        throw assignedStepsError;
      }

      if (!assignedSteps.length) {
        return res.status(403).json({
          success: false,
          message:
            "You are not assigned to this project.",
        });
      }

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
          "assigned_member_ids"
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
          projectSteps.flatMap(
            (step) =>
              step.assigned_member_ids || []
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

      // Get all gear categories
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

      // Initialize all categories
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

      // Count assigned gears
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





export const downloadFile =
  async (req, res) => {
    try {
      const { fileId } =
        req.params;

      const {
        data: file,
        error,
      } = await supabase
        .from("files")
        .select(`
          file_name,
          object_storage_key
        `)
        .eq(
          "file_id",
          fileId
        )
        .single();

      if (
        error ||
        !file
      ) {
        return res.status(404).json({
          success: false,
          message:
            "File not found",
        });
      }

      const command =
        new GetObjectCommand({
          Bucket:
            process.env
              .R2_BUCKET,

          Key:
            file.object_storage_key,

          ResponseContentDisposition:
            `attachment; filename="${file.file_name}"`,
        });

      const downloadUrl =
        await getSignedUrl(
          r2,
          command,
          {
            expiresIn: 300,
          }
        );

      return res.status(200).json({
        success: true,
        download_url:
          downloadUrl,
      });
    } catch (error) {
      console.error(
        "Download Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message,
      });
    }
  };

export const addProjectStep = async (req, res) => {
  try {
    const { clientId } = req.params;

    const {
      step_name,
      assigned_member_ids,
      step_order,
      venue,
      date,
      time,
    } = req.body;

    if (!step_name || !step_order) {
      return res.status(400).json({
        success: false,
        message: "step_name and step_order are required",
      });
    }

    const {
      data: existingSteps,
      error: fetchError,
    } = await supabase
      .from("project_steps")
      .select("project_step_id, step_order")
      .eq("client_id", clientId)
      .order("step_order", {
        ascending: true,
      });

    if (fetchError) throw fetchError;

    const finalOrder = Math.min(
      Number(step_order),
      existingSteps.length + 1
    );

    const stepsToShift = existingSteps.filter(
      (step) => step.step_order >= finalOrder
    );

    for (const step of stepsToShift) {
      const { error } = await supabase
        .from("project_steps")
        .update({
          step_order: step.step_order + 1,
        })
        .eq(
          "project_step_id",
          step.project_step_id
        );

      if (error) throw error;
    }

    const { data: newStep, error: insertError } =
      await supabase
        .from("project_steps")
        .insert({
          client_id: clientId,
          workflow_step_id: null,
          assigned_member_ids:
            assigned_member_ids ?? [],
          step_name,
          step_order: finalOrder,
          step_status: "pending",
          venue: venue ?? null,
          step_date: date ?? null,
          step_time: time ?? null,
        })
        .select()
        .single();

    if (insertError) throw insertError;

    return res.status(201).json({
      success: true,
      message: "Step added successfully",
      data: newStep,
    });
  } catch (error) {
    console.error("Add Step Error:", error);

    return res.status(500).json({
      success: false,
      message:
        error?.message ||
        "Internal Server Error",
    });
  }
};
 export const getContractStatus =
  async (req, res) => {
    try {
      const { clientId } =
        req.params;

      const {
        data: client,
        error,
      } = await supabase
        .from("clients")
        .select(`
          contract_signed,
          contract_signed_at,
          sign_name,
          created_at
        `)
        .eq(
          "client_id",
          clientId
        )
        .single();

      if (
        error ||
        !client
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Client not found",
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          contract_signed:
            client.contract_signed,

          contract_signed_at:
            client.contract_signed_at,

          sign_name:
            client.sign_name,

          created_at:
            client.created_at,
        },
      });
    } catch (error) {
      console.error(
        "Get Contract Status Error:",
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


  export const signContract =
  async (req, res) => {
    try {
      const { clientId } =
        req.params;

      const { sign_name } =
        req.body;

      if (
        !sign_name?.trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Sign name is required",
        });
      }

      const {
        data: client,
        error: clientError,
      } = await supabase
        .from("clients")
        .select("client_id")
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
        error: updateError,
      } = await supabase
        .from("clients")
        .update({
          contract_signed: true,

          contract_signed_at:
            new Date().toISOString(),

          sign_name:
            sign_name.trim(),
        })
        .eq(
          "client_id",
          clientId
        );

      if (updateError) {
        throw updateError;
      }

      return res.status(200).json({
        success: true,
        message:
          "Contract signed successfully",
      });
    } catch (error) {
      console.error(
        "Sign Contract Error:",
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


export const getClientLicenses =
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
          "license"
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

      const formattedFiles =
        await Promise.all(
          (files || []).map(
            async (file) => {
              const command =
                new GetObjectCommand({
                  Bucket:
                    process.env
                      .R2_BUCKET,
                  Key: file.object_storage_key,
                });

              const preview_url =
                await getSignedUrl(
                  r2,
                  command,
                  {
                    expiresIn: 3600,
                  }
                );

              return {
                ...file,
                preview_url,
              };
            }
          )
        );

      return res.status(200).json({
        success: true,
        data: formattedFiles,
      });
    } catch (error) {
      console.error(
        "Get Client Licenses Error:",
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

  export const downloadClientLicense =
  async (req, res) => {
    try {
      const { fileId } =
        req.params;

      const {
        data: file,
        error,
      } = await supabase
        .from("files")
        .select(`
          file_name,
          object_storage_key
        `)
        .eq(
          "file_id",
          fileId
        )
        .single();

      if (
        error ||
        !file
      ) {
        return res.status(404).json({
          success: false,
          message:
            "File not found",
        });
      }

      const command =
        new GetObjectCommand({
          Bucket:
            process.env
              .R2_BUCKET_NAME,

          Key: file.object_storage_key,

          ResponseContentDisposition: `attachment; filename="${file.file_name}"`,
        });

      const downloadUrl =
        await getSignedUrl(
          r2,
          command,
          {
            expiresIn: 300,
          }
        );

      return res.status(200).json({
        success: true,
        data: {
          download_url:
            downloadUrl,
        },
      });
    } catch (error) {
      console.error(
        "Download License Error:",
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


  export const getClientInvoice = async (req, res) => {
  try {
    const { client_id } = req.params;

    if (!client_id) {
      return res.status(400).json({
        success: false,
        message: "Client ID is required",
      });
    }

    // Fetch Invoice
    const {
      data: invoice,
      error: invoiceError,
    } = await supabase
      .from("invoices")
      .select("*")
      .eq("client_id", client_id)
      .single();

    if (invoiceError) {
      if (invoiceError.code === "PGRST116") {
        return res.status(404).json({
          success: false,
          message: "Invoice not found",
        });
      }

      return res.status(500).json({
        success: false,
        message: invoiceError.message,
      });
    }

    // Fetch Invoice Items
    const {
      data: invoiceItems,
      error: itemsError,
    } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.invoice_id)
      .order("invoice_item_id", {
        ascending: true,
      });

    if (itemsError) {
      return res.status(500).json({
        success: false,
        message: itemsError.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        invoice,
        invoice_items: invoiceItems,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


export const addInvoiceItem = async (req, res) => {
  try {
    const { clientId } = req.params;
    const { item_name, quantity, rate } = req.body;

    if (!item_name || !quantity || rate === undefined) {
      return res.status(400).json({
        success: false,
        message: "item_name, quantity and rate are required",
      });
    }

    // ----------------------------------------------------
    // GET CLIENT INVOICE
    // ----------------------------------------------------

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*")
      .eq("client_id", clientId)
      .single();

    if (invoiceError || !invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    // ----------------------------------------------------
    // CREATE INVOICE ITEM
    // ----------------------------------------------------

    const amount = Number(quantity) * Number(rate);

    const { error: itemError } = await supabase
      .from("invoice_items")
      .insert([
        {
          invoice_id: invoice.invoice_id,
          item_name,
          quantity: Number(quantity),
          rate: Number(rate),
          amount,
        },
      ]);

    if (itemError) {
      return res.status(500).json({
        success: false,
        message: itemError.message,
      });
    }

    // ----------------------------------------------------
    // FETCH ALL INVOICE ITEMS
    // ----------------------------------------------------

    const { data: invoiceItems, error: itemsError } = await supabase
      .from("invoice_items")
      .select("*")
      .eq("invoice_id", invoice.invoice_id);

    if (itemsError) {
      return res.status(500).json({
        success: false,
        message: itemsError.message,
      });
    }

    // ----------------------------------------------------
    // RECALCULATE TOTALS
    // ----------------------------------------------------

    const subtotalAmount = invoiceItems.reduce(
      (sum, item) => sum + Number(item.amount),
      0
    );

    const finalAmount =
      subtotalAmount +
      Number(invoice.tax_amount) +
      Number(invoice.travel_fee) -
      Number(invoice.discount_amount);

    const amountDue = finalAmount - Number(invoice.amount_paid);

    // ----------------------------------------------------
    // UPDATE INVOICE
    // ----------------------------------------------------

    const { data: updatedInvoice, error: updateError } = await supabase
      .from("invoices")
      .update({
        subtotal_amount: subtotalAmount,
        final_amount: finalAmount,
        amount_due: amountDue,
      })
      .eq("invoice_id", invoice.invoice_id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({
        success: false,
        message: updateError.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Invoice item added successfully",
      data: updatedInvoice,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


export const updateInvoiceItem = async (
  req,
  res
) => {
  try {
    const {
      invoice_item_id,
      invoice_id,
      item_name,
      quantity,
      rate,
    } = req.body;

    console.log(invoice_item_id)
    console.log(rate)

    if (
      !invoice_item_id ||
      !invoice_id
    ) {
      return res.status(400).json({
        success: false,
        message:
          "invoice_item_id and invoice_id are required",
      });
    }

    const amount =
      Number(quantity) *
      Number(rate);

    // -----------------------------------
    // Update invoice item
    // -----------------------------------

    const {
      error: updateItemError,
    } = await supabase
      .from("invoice_items")
      .update({
        item_name,
        quantity,
        rate,
        amount,
      })
      .eq(
        "invoice_item_id",
        invoice_item_id
      );

    if (updateItemError) {
      throw updateItemError;
    }

    // -----------------------------------
    // Fetch all invoice items
    // -----------------------------------

    const {
      data: invoiceItems,
      error: itemsError,
    } = await supabase
      .from("invoice_items")
      .select("amount")
      .eq(
        "invoice_id",
        invoice_id
      );

    if (itemsError) {
      throw itemsError;
    }

    const subtotal =
      invoiceItems.reduce(
        (sum, item) =>
          sum +
          Number(item.amount),
        0
      );

    // -----------------------------------
    // Fetch invoice
    // -----------------------------------

    const {
      data: invoice,
      error: invoiceError,
    } = await supabase
      .from("invoices")
      .select(`
        tax_amount,
        discount_amount,
        travel_fee,
        amount_paid
      `)
      .eq(
        "invoice_id",
        invoice_id
      )
      .single();

    if (invoiceError) {
      throw invoiceError;
    }

    const tax =
      Number(
        invoice.tax_amount
      ) || 0;

    const discount =
      Number(
        invoice.discount_amount
      ) || 0;

    const travelFee =
      Number(
        invoice.travel_fee
      ) || 0;

    const amountPaid =
      Number(
        invoice.amount_paid
      ) || 0;

    const finalAmount =
      subtotal +
      tax +
      travelFee -
      discount;

    const amountDue =
      finalAmount -
      amountPaid;

    // -----------------------------------
    // Update invoice
    // -----------------------------------

    const {
      error: updateInvoiceError,
    } = await supabase
      .from("invoices")
      .update({
        subtotal_amount:
          subtotal,

        final_amount:
          finalAmount,

        amount_due:
          amountDue,
      })
      .eq(
        "invoice_id",
        invoice_id
      );

    if (updateInvoiceError) {
      throw updateInvoiceError;
    }

    return res.status(200).json({
      success: true,
      message:
        "Invoice updated successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message:
        error.message,
    });
  }
};

export const deleteInvoiceItem = async (
  req,
  res
) => {
  try {
    const {
      invoice_item_id,
      invoice_id,
    } = req.body;

    if (
      !invoice_item_id ||
      !invoice_id
    ) {
      return res.status(400).json({
        success: false,
        message:
          "invoice_item_id and invoice_id are required",
      });
    }

    // -----------------------------
    // Delete invoice item
    // -----------------------------

    const {
      error: deleteError,
    } = await supabase
      .from("invoice_items")
      .delete()
      .eq(
        "invoice_item_id",
        invoice_item_id
      );

    if (deleteError) {
      throw deleteError;
    }

    // -----------------------------
    // Fetch remaining invoice items
    // -----------------------------

    const {
      data: invoiceItems,
      error: itemsError,
    } = await supabase
      .from("invoice_items")
      .select("amount")
      .eq(
        "invoice_id",
        invoice_id
      );

    if (itemsError) {
      throw itemsError;
    }

    const subtotal =
      invoiceItems.reduce(
        (sum, item) =>
          sum + Number(item.amount),
        0
      );

    // -----------------------------
    // Fetch invoice
    // -----------------------------

    const {
      data: invoice,
      error: invoiceError,
    } = await supabase
      .from("invoices")
      .select(`
        tax_amount,
        discount_amount,
        travel_fee,
        amount_paid
      `)
      .eq(
        "invoice_id",
        invoice_id
      )
      .single();

    if (invoiceError) {
      throw invoiceError;
    }

    const tax =
      Number(invoice.tax_amount) || 0;

    const discount =
      Number(invoice.discount_amount) || 0;

    const travelFee =
      Number(invoice.travel_fee) || 0;

    const amountPaid =
      Number(invoice.amount_paid) || 0;

    const finalAmount =
      subtotal +
      tax +
      travelFee -
      discount;

    const amountDue =
      finalAmount -
      amountPaid;

    // -----------------------------
    // Update invoice
    // -----------------------------

    const {
      error: updateInvoiceError,
    } = await supabase
      .from("invoices")
      .update({
        subtotal_amount:
          subtotal,
        final_amount:
          finalAmount,
        amount_due:
          amountDue,
      })
      .eq(
        "invoice_id",
        invoice_id
      );

    if (updateInvoiceError) {
      throw updateInvoiceError;
    }

    return res.status(200).json({
      success: true,
      message:
        "Invoice item deleted successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message:
        error.message,
    });
  }
};


export const getProjectStepsForTravel =
  async (req, res) => {
    try {
      const { clientId } =
        req.params;

      const {
        data: projectSteps,
        error,
      } = await supabase
        .from("project_steps")
        .select(`
          project_step_id,
          step_name,
          venue,
          travel_distance
        `)
        .eq(
          "client_id",
          clientId
        )
        .order("step_order", {
          ascending: true,
        });

      if (error) {
        throw error;
      }

      return res.status(200).json({
        success: true,
        data: projectSteps,
      });
    } catch (error) {
      console.error(
        "Get Project Steps Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Internal Server Error",
      });
    }
  };



  export const updateProjectStepTravel =
  async (req, res) => {
    try {
      const { clientId, projectStepId } =
        req.params;

      const {
        venue,
        travel_distance,
      } = req.body;

      // -----------------------------
      // CONFIG
      // -----------------------------

      const FREE_MILES = 20;
      const RATE_PER_MILE = 0.70;

      // -----------------------------
      // Update project step
      // -----------------------------

      const {
        error: updateStepError,
      } = await supabase
        .from("project_steps")
        .update({
          venue,
          travel_distance,
        })
        .eq(
          "project_step_id",
          projectStepId
        )
        .eq(
          "client_id",
          clientId
        );

      if (updateStepError) {
        throw updateStepError;
      }

      // -----------------------------
      // Get all project steps
      // -----------------------------

      const {
        data: projectSteps,
        error: projectStepsError,
      } = await supabase
        .from("project_steps")
        .select("travel_distance")
        .eq(
          "client_id",
          clientId
        );

      if (projectStepsError) {
        throw projectStepsError;
      }

      const totalMiles =
        projectSteps.reduce(
          (sum, step) =>
            sum +
            Number(
              step.travel_distance || 0
            ),
          0
        );

      const billableMiles = Math.max(
        totalMiles - FREE_MILES,
        0
      );

      const travelFee =
        billableMiles *
        RATE_PER_MILE;

      // -----------------------------
      // Update Invoice
      // -----------------------------

      const {
        data: invoice,
        error: invoiceError,
      } = await supabase
        .from("invoices")
        .select(`
          invoice_id,
          subtotal_amount,
          tax_amount,
          discount_amount,
          amount_paid
        `)
        .eq(
          "client_id",
          clientId
        )
        .single();

      if (invoiceError) {
        throw invoiceError;
      }

      const subtotal =
        Number(
          invoice.subtotal_amount
        ) || 0;

      const tax =
        Number(
          invoice.tax_amount
        ) || 0;

      const discount =
        Number(
          invoice.discount_amount
        ) || 0;

      const amountPaid =
        Number(
          invoice.amount_paid
        ) || 0;

      const finalAmount =
        subtotal +
        tax +
        travelFee -
        discount;

      const amountDue =
        finalAmount -
        amountPaid;

      const {
        error: updateInvoiceError,
      } = await supabase
        .from("invoices")
        .update({
          travel_fee: travelFee,
          final_amount:
            finalAmount,
          amount_due:
            amountDue,
        })
        .eq(
          "invoice_id",
          invoice.invoice_id
        );

      if (updateInvoiceError) {
        throw updateInvoiceError;
      }

      return res.status(200).json({
        success: true,
        message:
          "Travel information updated successfully.",
        data: {
          total_miles:
            totalMiles,
          billable_miles:
            billableMiles,
          travel_fee:
            travelFee,
        },
      });
    } catch (error) {
      console.error(
        "Update Travel Error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          error.message ||
          "Internal Server Error",
      });
    }
  };



  export const updateProjectStep = async (req, res) => {
  try {
    const { project_step_id } = req.params;

    const {
      step_name,
      assigned_member_ids,
      venue,
      scheduled_time,
    } = req.body;

    const updateData = {};

    if (step_name !== undefined)
      updateData.step_name = step_name;

    if (assigned_member_ids !== undefined)
      updateData.assigned_member_ids =
        assigned_member_ids;

    if (venue !== undefined)
      updateData.venue = venue;

    if (scheduled_time !== undefined)
      updateData.scheduled_time =
        scheduled_time;

    const { data, error } = await supabase
      .from("project_steps")
      .update(updateData)
      .eq(
        "project_step_id",
        project_step_id
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      message:
        "Project step updated successfully.",
      data,
    });
  } catch (error) {
    console.error(
      "Update Project Step Error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Internal Server Error",
    });
  }
};